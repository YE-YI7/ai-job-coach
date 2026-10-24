import { chatPanelWidth } from "./chat-panel-width";

test("saved wide chat leaves room for the document after a viewport shrink", () => {
  expect(chatPanelWidth(1250, 760, true)).toEqual({ maximum: 672, width: 672 });
  expect(chatPanelWidth(1050, 760, true)).toEqual({ maximum: 472, width: 472 });
  expect(chatPanelWidth(1500, 760, true).width).toBe(760);
});
test("keyboard and corrupt preferences cannot produce negative bounds or NaN", () => {
  expect(chatPanelWidth(390, 760, true)).toEqual({ maximum: 320, width: 320 });
  expect(chatPanelWidth(1200, NaN, false).width).toBe(384);
  expect(chatPanelWidth(1200, -50, false).width).toBe(320);
});
