import { updateNodeElement } from "../DOM"
import {
  createTaskQueue,
  arrified,
  createStateNode,
  getTag,
  getRoot
} from "../Misc"



/**
 * 任务队列
 */
const taskQueue = createTaskQueue()
/**
 * 要执行的子任务
 */
let subTask = null


let pendingCommit = null

/**
 * commit阶段，更新dom的函数,该过程不可被打断
 * @param {*} fiber 更新传入fiber的effects数组中的fiber
 */
const commitAllWork = fiber => { //commit阶段 更新dom
  console.log(fiber);
  /**
   * 循环 effets 数组 构建 DOM 节点树
   */
  fiber.effects.forEach(item => {
    if (item.tag === "class_component") { //如果这个fiber是 类组件类型时
      item.stateNode.__fiber = item  //给当前实例上储存下 fiber 做下相互引用，后续方便用来做state融合
    }

    if (item.effectTag === "delete") {// 删除操作，
      item.parent.stateNode.removeChild(item.stateNode) //直接删除
    } else if (item.effectTag === "update") { //更新操作
      /**
       * 更新
       */
      if (item.type === item.alternate.type) { //更新时每个节点都有alternate
        /**
         *  节点类型相同,更新属性
         */
        updateNodeElement(item.stateNode, item, item.alternate)
      } else {
        /**
         * 节点类型不同,直接更新节点
         */
        item.parent.stateNode.replaceChild(
          item.stateNode, //新的dom
          item.alternate.stateNode //旧的dom
        )
      }
    } else if (item.effectTag === "placement") { //初始渲染
      /**
      * 向页面中追加节点
      */
      /**
       * 当前要追加的子节点
       */
      let fiber = item
      /**
       * 当前要追加的子节点的父级fiber
       */
      let parentFiber = item.parent

      /**
       * 找到普通节点父级 排除组件父级
       * 因为组件父级是不能直接追加真实DOM节点的,组件得stateNode是组件实例，不是真实dom
       */
      while ( //父节fiber如果是 函数或者类标识的fiber时 不是有效的dom fiber
        parentFiber.tag === "class_component" ||
        parentFiber.tag === "function_component"
      ) {
        parentFiber = parentFiber.parent
      }

      /**
       * 如果子节点是普通节点 找到父级 将子节点追加到父级中
       * type是string  我们定义的普通类型时
       */

      if (fiber.tag === "host_component") {
        //把当前stateNode也就是储存的真实dom   插入到父级真实dom中
        parentFiber.stateNode.appendChild(fiber.stateNode)
      }
    }
  })

  /**
 * 每次更新完成,备份一下旧的 fiber 节点对象，后续更新对比使用
 * 在这里fiber会是rootfiber对象 顶级的fiber ，然后备份下fiber到 dom对象上 getFirstTask方法会用到
 * 因为每次是从头开始构建子任务,所以每次赋值一个顶级的旧的fiber就可以,每次会以这个拆分旧的往下分发子fiber
 */
  fiber.stateNode.__rootFiberContainer = fiber
}




/**
* 从任务队列中获取任务,来获取rootfiber 返回最外层的fiber对象
*/
const getFirstTask = () => {
  const task = taskQueue.pop() //从队列取出任务,先进先出,内部调用shift
  if (task.from === "class_component") { // 类组件setState时的任务
    console.log(getRoot)
    const root = getRoot(task.instance) //获取最外层的fiber 生成任务开始构建
    task.instance.__fiber.partialState = task.partialState //给组件实例上的_fiber储存一下新的状态 
    //后续构建类组件fiber时再合并
    return { //返回最外层的fiber，然后开始从头开始构建fiber生成子任务
      props: root.props,
      stateNode: root.stateNode,
      tag: "host_root",
      effects: [],
      child: null,
      alternate: root //这里的操作是setState,更新操作, 需要储存alternate 老的root，方便后续新旧fiber对比更新
    }
  }
  /**
   * 先处理首次渲染,返回最外层节点的fiber对象
   */
  return {
    props: task.props, //储存props
    stateNode: task.dom, // 父级容器的dom id为root的 dom  也就是rootfiber
    tag: "host_root", //标识起点
    effects: [], //储存 下级的fiber对象
    child: null, //子集fiber  只有一个子集剩下的都是兄弟节点
    alternate: task.dom.__rootFiberContainer //更新操作, 需要储存alternate 老的fiber，方便后续新旧fiber对比更新
    //render(<div></div>)  render(<span></span>);这种
  }
}



/**
 * 该函数用来构建当前fiber的所有子fiber对象
 * @param {*} fiber 当前的fiber对象
 * @param {*} children  要构建的子级fiber 对象集合
 */
const reconcileChildren = (fiber, children) => {
  /**
   * children 可能对象 也可能是数组
   * 将children 转换成数组
   * 
   * 首次加载调用时 是个对象,后续生成子任务是数组，做个统一数据格式处理
   */

  const arrifiedChildren = arrified(children) //转换为数组格式

  /**
   * 循环 children 使用的索引
   */
  let index = 0
  /**
   * children 数组中元素的个数
   */
  let numberOfElements = arrifiedChildren.length
  /**
   * 循环过程中的循环项 就是子节点的 virtualDOM 对象
   */
  let element = null
  /**
   * 子级 fiber 对象
   */
  let newFiber = null
  /**
   * 上一个兄弟 fiber 对象
   */
  let prevFiber = null

  let alternate = null //旧的fiber对象

  if (fiber.alternate && fiber.alternate.child) {
    //首次渲染是不存在 alternate 的，然后在 commit阶段完成后alternate会存在 
    //也就是说 更新阶段会存在,在这里获取一下子级，因为下面也是 先对子级作对比
    alternate = fiber.alternate.child
  }

  while (index < numberOfElements || alternate) { //同级比对
    //在这里循环要加一个alternate为true的条件，因为我们的fiber是一一对应的，在这里是为了防止element不存在而alternate存在
    //后续为了标识删除操作
    //这个循环判断相当于 一个双层比对,新旧fiber子级互相筛选比对, 存在相同的就更新，新的fiber在旧的中不存在就生成一个新增的fiber
    //新的不存在  旧的存在 就把旧的标记删除
    /**
     * 子级 virtualDOM 对象
     */
    element = arrifiedChildren[index]

    if (!element && alternate) {
      /**
       * 删除操作
       */
      alternate.effectTag = "delete" //删除不用生成fiber， 直接给旧的fiber标识删除
      //然后把它添加到当前fiber ，也就是新生成的effects中，因为我们最后是全部收集到最外层的effects中做的循环处理
      fiber.effects.push(alternate)
    } else if(element && alternate) { // 两个都存在，一一对应,要做更新操作
      /**
       * 更新
       */
      newFiber = {
        type: element.type,
        props: element.props,
        tag: getTag(element),
        effects: [],
        effectTag: "update", //和初始渲染 不一样的是 操作类型不一样。这里标识是更新
        parent: fiber,
        alternate, //因为fiber是一一对应的，我们前面是只对应了最外面root那一层，所以这里也要对应上
        //这里是为了 子任务executeTask 再次进入 reconcileChildren 时 获取child时 获取到alternate（上面代码155行）
      }
      if (element.type === alternate.type) {
        /**
         * 类型相同，不需要生成dom，直接用旧的赋值
         */
        newFiber.stateNode = alternate.stateNode
      } else {
        /**
         * 类型不同,需要重新生成替换
         */
        newFiber.stateNode = createStateNode(newFiber)
      }
    } else if (element && !alternate) {
      //初始渲染
      //子集fiber
      newFiber = {
        type: element.type,
        props: element.props,
        tag: getTag(element),
        effects: [],
        effectTag: "placement",
        parent: fiber
      }
      //为fiber节点添加dom对象或组件实例
      newFiber.stateNode = createStateNode(newFiber)
    }


    //当前fiber的子级 newFiber构建完毕了，当前fiber只有一个子级newFiber， 其他和和这个newFiber平级的都是它的兄弟

    if (index === 0) { //第一个，认为是fiber的子级

      fiber.child = newFiber;
    } else if (element) { //循环首次不会走这里,第1之后的节点,首次循环之后我们会每次把上次的newFiber赋值给prevFiber，第一轮之后就有值了
      //我们每次都把当前这个newFiber设置为 上一个fiber的兄弟节点. 没有兄弟节点的可以认为是 当前子级最后一个
      prevFiber.sibling = newFiber
    }


    if (alternate && alternate.sibling) { //本次对比结束了,要进行下一个比对了,我们知道我们下一个都是通过
      //sibling 兄弟来设置的，所以我们来获取它的下一个兄弟
      alternate = alternate.sibling
    } else { //如果没兄弟了，相当于旧的 fiber 走完了
      alternate = null
    }

    // 更新
    prevFiber = newFiber //首次为null,首次结束之后就有值了,
    //每次循环结束后  把当前这个newfiber赋值给prevFiber， 下次循环时他就是上一个fiber
    index++
  }
  //到这里当前的 子级children fiber构建完毕


}







/**
 * 这里的设计是每一轮未被打断的新的更新,最开始的任务 (render(),setState)都是从rootFiber 来生成子任务.
 * 生成一个子任务 返回 当前fiber 的child fiber 或者 它的sibling fiber 兄弟 以及给当前 fiber的
 * effects中收集 子孙级的fiber对象， 并且设置pendingCommit 最外层的fiber对象
 * @param {*} fiber 传入的fiber对象 
 */
const executeTask = fiber => {

  /**
   * 开始构建子fiber对象,对于后面来说每个fiber都是一个子任务  
   */

  if (fiber.tag === 'class_component') { //如果当前传入的fiber是一个类组件类型
    if (fiber.stateNode.__fiber && fiber.stateNode.__fiber.partialState) { //当前fiber是组件类型
      //这个时候如果stateNode如果要是存在的话,那就不是首次渲染的情况了，是更新
      //在我们目前的设计中只有setState会触发更新
      fiber.stateNode.state = { //所以进行新旧state合并
        ...fiber.stateNode.state,
        ...fiber.stateNode.__fiber.partialState
      }
    }
    reconcileChildren(fiber, fiber.stateNode.render()) //通过render函数获取 类组件的子集
  } else if (fiber.tag === "function_component") { //函数直接调用
    reconcileChildren(fiber, fiber.stateNode(fiber.props))
  } else {
    reconcileChildren(fiber, fiber.props.children) //只构建当前这一个下的子fiber
  }

  /**
   * 这里构建完毕当前fiber的 子fiber了
   * 如果子级存在 返回子级
   * 然后将这个子级当做父级 继续构建这个父级下的子级
   */
  console.log(fiber)
  if (fiber.child) { //这里返回了child, 我们会循环调用executeTask，然后下次传入它的参数就是我们返回的child，然后会构建
    //它的子fiber
    return fiber.child
  }
  /**
   * 如果存在同级 返回同级 构建同级的子级
   * 如果同级不存在 返回到父级 看父级是否有同级
   * 
   * 这里是优先构建子级，如果当前fiber没有子级了，再去构建它的同级，同级不存在返回父级
   */
  let currentExecutelyFiber = fiber
  while (currentExecutelyFiber.parent) { //如果有父级，有父级时才有可能有子级
    currentExecutelyFiber.parent.effects = currentExecutelyFiber.parent.effects.concat(
      //把自己当前的fiber 和自己收集到的自己子fiber 的effects 合并放到 父级的effects中
      //这样最后在外面的fiber的effects中就会有所有所属它下的fiber
      currentExecutelyFiber.effects.concat([currentExecutelyFiber])
    )

    if (currentExecutelyFiber.sibling) { //如果当前fiber有同级,返回同级 来构建同级的子集
      return currentExecutelyFiber.sibling
    }

    currentExecutelyFiber = currentExecutelyFiber.parent //没有同级的时候 返回它的父级 ，看看它的父级是否有同级 需要构建
  }

  //走到这里时也就是说找到了最外层的fiber了,rootfiber，因为已经没有父级了
  //这会就表明 我们的一次完整 由rootfiber开始生成子任务的 fiber的过程完毕了
  //这会我们需要一个变量存储最外层的rootfiber,然后标识进入下一commit阶段了

  pendingCommit = currentExecutelyFiber
}






const workLoop = deadline => {
  /**
   * 如果子任务不存在 就去获取子任务
   */
  if (!subTask) {
    subTask = getFirstTask()
  }
  /**
   * 如果任务存在并且浏览器有空余时间就调用
   * executeTask 方法执行任务 接受任务 返回新的子任务, 它会生成fiber对象,它是可以被打断的
   */
  while (subTask && deadline.timeRemaining() > 1) {
    subTask = executeTask(subTask)
  }

  if (pendingCommit) {
    commitAllWork(pendingCommit)
    pendingCommit = null
  }
}





/**
 * 在事件循环空闲时即将被调用的函数，也就是说它是浏览器有空余时间时要执行的函数
 * @param {*} deadline 这个参数可以获取当前空闲时间以及回调是否在超时时间前已经执行的状态
 */
const performTask = deadline => {
  /**
   * 浏览器空闲了,执行任务
   */
  workLoop(deadline)
  /**
   * 判断任务是否存在
   * 判断任务队列中是否还有任务没有执行
   * 再一次告诉浏览器在空闲的时间执行任务
   */
  if (subTask || !taskQueue.isEmpty()) { //一个任务 会生成 子集fiber 返回子任务 这个过程是优先级较低的任务是可以被打断的
    //这里判断如果被打断了   而且子任务还没有执行完毕,要继续调用requestIdleCallback 等待有空余时间继续执行
    requestIdleCallback(performTask)
  }
}





export const render = (element, dom) => {
  /**
   * 1. 向任务队列中添加任务
   * 2. 指定在浏览器空闲时执行任务
   */
  /**
   * 任务就是通过 vdom 对象 构建 fiber 对象
   */
  taskQueue.push({
    dom,
    props: { children: element }
  })
  /**
   * 指定在浏览器空闲的时间去执行任务,空闲时执行performTask函数
   */
  requestIdleCallback(performTask)
}

//组件更新的方法
export const scheduleUpdate = (instance, partialState) => { //组件更新时的方法
  taskQueue.push({    //往队列里push一个 组件类型任务
    from: "class_component",
    instance, //组件实例
    partialState //新的状态
  })
  requestIdleCallback(performTask)
}