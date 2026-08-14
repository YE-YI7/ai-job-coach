const scanButton = document.querySelector("#scan");
const fillButton = document.querySelector("#fill");
const fieldsRoot = document.querySelector("#fields");
const status = document.querySelector("#status");
const actions = document.querySelector("#actions");
const title = document.querySelector("#pageTitle");
let activeTabId = null;
let scannedFields = [];

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error("请先打开一个网申网页");
  activeTabId = tab.id;
  return tab;
}

async function send(message) {
  const tab = await activeTab();
  try { return await chrome.tabs.sendMessage(tab.id, message); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

function render(fields) {
  fieldsRoot.replaceChildren();
  for (const [index, field] of fields.entries()) {
    const wrapper = document.createElement("div");
    wrapper.className = `field${field.sensitive ? " sensitive" : ""}`;
    const heading = document.createElement("label");
    heading.textContent = field.label;
    if (field.required) { const required = document.createElement("span"); required.textContent = "必填"; heading.append(required); }
    wrapper.append(heading);
    if (field.sensitive) {
      const hint = document.createElement("small"); hint.textContent = "敏感字段：请回到页面手动填写"; wrapper.append(hint);
    } else {
      const input = field.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      input.value = field.valuePreview === "false" ? "" : field.valuePreview;
      input.dataset.index = String(index);
      wrapper.append(input);
    }
    fieldsRoot.append(wrapper);
  }
  actions.hidden = !fields.some((field) => !field.sensitive);
}

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true; status.textContent = "正在读取当前页面…";
  try {
    const result = await send({ type: "YIZHI_INSPECT_FORM" });
    scannedFields = result.fields || [];
    title.textContent = result.title || result.origin;
    status.textContent = `发现 ${scannedFields.length} 个可识别字段`;
    render(scannedFields);
  } catch (error) { status.textContent = error.message || "读取失败，请刷新页面重试"; }
  finally { scanButton.disabled = false; }
});

fillButton.addEventListener("click", async () => {
  fillButton.disabled = true; status.textContent = "正在填写…";
  try {
    const fields = [...fieldsRoot.querySelectorAll("input, textarea")].map((input) => ({ selector: scannedFields[Number(input.dataset.index)].selector, value: input.value })).filter((field) => field.value !== "");
    const result = await send({ type: "YIZHI_FILL_FIELDS", fields });
    const filled = (result.results || []).filter((item) => item.status === "filled").length;
    status.textContent = `已填写 ${filled} 项。请回到页面逐项检查。`;
  } catch (error) { status.textContent = error.message || "填写失败"; }
  finally { fillButton.disabled = false; }
});
