import { createDOMElement } from "../../DOM"
import { createReactInstance } from "../createReactInstance"

const createStateNode = fiber => {
  if (fiber.tag === "host_component") {  //如果是普通标签 例如div 直接创建html片段
    return createDOMElement(fiber)
  } else {
    return createReactInstance(fiber) // 返回组件实例
  }
}

export default createStateNode
