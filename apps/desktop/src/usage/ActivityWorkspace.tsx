import {lazy,Suspense,useState,type ReactNode} from 'react';
const UsageSurface=lazy(()=>import('./UsageSurface'));
export function ActivityWorkspace({children}:{children:ReactNode}){
  const [privateUsage,setPrivate]=useState(false);
  return <div className="usage-workspace"><nav className="usage-tabs" aria-label="活动与用量视图"><button type="button" aria-pressed={!privateUsage} onClick={()=>setPrivate(false)}>公开活动</button><button type="button" aria-pressed={privateUsage} onClick={()=>setPrivate(true)}>私有用量</button></nav><div className="usage-workspace-body">{privateUsage?<Suspense fallback={<p role="status" className="usage-surface">正在打开私有用量页…</p>}><UsageSurface/></Suspense>:children}</div></div>;
}
