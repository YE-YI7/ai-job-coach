(() => {
  if (globalThis.__YIZHI_FORM_BRIDGE__) return;
  globalThis.__YIZHI_FORM_BRIDGE__ = true;

  const blockedTypes = new Set(["password", "file", "hidden", "submit", "button", "reset"]);
  const sensitive = /(性别|婚姻|婚育|民族|宗教|政治面貌|身份证|salary|compensation|薪资|期望薪酬|gender|marital|ethnicity|religion|national.?id)/i;

  function labelFor(element) {
    const byFor = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
    const wrapping = element.closest("label");
    const aria = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby");
    return (byFor?.textContent || wrapping?.textContent || aria || element.getAttribute("placeholder") || element.getAttribute("name") || "未命名字段").trim().replace(/\s+/g, " ").slice(0, 160);
  }

  function selectorFor(element, index) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const name = element.getAttribute("name");
    if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    return `[data-yizhi-field="${index}"]`;
  }

  function inspect() {
    const nodes = [...document.querySelectorAll("input, textarea, select")];
    return nodes.flatMap((element, index) => {
      const type = (element.getAttribute("type") || element.tagName.toLowerCase()).toLowerCase();
      if (blockedTypes.has(type) || element.disabled || element.readOnly) return [];
      element.setAttribute("data-yizhi-field", String(index));
      const label = labelFor(element);
      return [{
        selector: selectorFor(element, index),
        label,
        type,
        required: Boolean(element.required),
        sensitive: sensitive.test(`${label} ${element.getAttribute("name") || ""}`),
        valuePreview: type === "checkbox" || type === "radio" ? String(element.checked) : String(element.value || "").slice(0, 80),
      }];
    });
  }

  function fill(fields) {
    return fields.map(({ selector, value }) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, status: "missing" };
      const label = labelFor(element);
      const type = (element.getAttribute("type") || element.tagName.toLowerCase()).toLowerCase();
      if (blockedTypes.has(type) || sensitive.test(`${label} ${element.getAttribute("name") || ""}`)) return { selector, status: "needs_confirmation" };
      if (element instanceof HTMLInputElement && (type === "checkbox" || type === "radio")) element.checked = Boolean(value);
      else element.value = String(value ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { selector, status: "filled" };
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "YIZHI_INSPECT_FORM") sendResponse({ ok: true, fields: inspect(), origin: location.origin, title: document.title });
    if (message?.type === "YIZHI_FILL_FIELDS") sendResponse({ ok: true, results: fill(Array.isArray(message.fields) ? message.fields : []) });
  });
})();
