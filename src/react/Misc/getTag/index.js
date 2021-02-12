import { Component } from "../../Component"

const getTag = vdom => {
  if (typeof vdom.type === "string") {
    return "host_component"
  } else if (Object.getPrototypeOf(vdom.type) === Component) { //我们的组件都是继承自Componetn 所以获取原型判断
    return "class_component"
  } else {
    return "function_component"
  }
}
export default getTag
