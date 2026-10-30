import {useEffect,useRef,useState} from 'react';

export interface QuoteResult<T>{data?:T;error?:unknown;loading:boolean;expiresAt:number}
/** 报价结束后再安排刷新；轮询不能取消在途请求。刷新失败保留原有效期，不能把旧报价续期。 */
export function createQuoteRunner<T>(load:()=>Promise<T>,publish:(state:QuoteResult<T>)=>void,refreshMs=30000,maxAgeMs=90000){
  let stopped=false,inFlight=false,timer:ReturnType<typeof setTimeout>|undefined;
  let state:QuoteResult<T>={loading:false,expiresAt:0};
  const run=async()=>{
    if(stopped||inFlight)return;
    clearTimeout(timer);inFlight=true;state={...state,loading:true,error:undefined};publish(state);
    try{const data=await load();if(!stopped){state={data,loading:false,expiresAt:Date.now()+maxAgeMs};publish(state);}}
    catch(error){if(!stopped){state={...state,error,loading:false};publish(state);}}
    finally{inFlight=false;if(!stopped)timer=setTimeout(()=>void run(),refreshMs);}
  };
  void run();
  return {refresh:()=>void run(),stop:()=>{stopped=true;clearTimeout(timer);}};
}

export function useAsyncQuote<T>(key:string|null,load:()=>Promise<T>){
  const loader=useRef(load);loader.current=load;
  const runner=useRef<ReturnType<typeof createQuoteRunner<T>>|null>(null);
  const [snapshot,setSnapshot]=useState<{key:string;state:QuoteResult<T>}|null>(null);
  useEffect(()=>{
    if(key===null){runner.current=null;return;}
    const task=createQuoteRunner(()=>loader.current(),state=>setSnapshot({key,state}));runner.current=task;
    return()=>{task.stop();if(runner.current===task)runner.current=null;};
  },[key]);
  const state=snapshot?.key===key?snapshot.state:undefined;
  return {data:state?.data,error:state?.error,loading:key!==null&&(!state||state.loading),
    expired:!!state?.data&&Date.now()>=state.expiresAt,refresh:()=>runner.current?.refresh()};
}
