/** 组件测试只替代CSS类名，不改变浏览器中的真实样式或业务逻辑。 */
const classes = new Proxy(
  {},
  {
    get: (_target, property) => (typeof property === "string" ? property : ""),
  },
);
export default classes;
