import { useEffect, useMemo, useRef, useState } from 'react'
import { PersistentForceGraph } from '../../lib/forceGraph'

function createController(jobId) {
  const controller = new PersistentForceGraph()
  controller.jobId = jobId
  return controller
}

export function usePersistentForceGraph(graph, jobId = 'current-job') {
  const controller = useMemo(() => createController(jobId), [jobId])
  const [world, setWorld] = useState(() => controller.snapshot())
  const frameRef = useRef(0)
  const pendingRef = useRef(world)

  useEffect(() => {
    controller.reconcile(graph)
  }, [controller, graph])

  useEffect(() => {
    const unsubscribe = controller.subscribe((snapshot) => {
      pendingRef.current = snapshot
      if (frameRef.current) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        setWorld(pendingRef.current)
      })
    })
    return () => {
      unsubscribe()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [controller])

  useEffect(() => () => controller.dispose(), [controller])

  return { controller, world }
}
