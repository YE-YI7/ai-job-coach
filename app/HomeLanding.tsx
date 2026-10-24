import FirstLightHome from "./first-light/FirstLightHome";

export { HOME_FAQS } from "./first-light/home-facts";

/** The selected Claude → DeepSeek v5 design; existing application flows stay separate. */
export default function HomeLanding() {
  return <FirstLightHome />;
}
