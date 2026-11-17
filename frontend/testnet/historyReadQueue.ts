export type HistoryReadPriority='foreground'|'background';
export interface HistoryReadQueue {
 run<T>(key:string,priority:HistoryReadPriority,load:()=>Promise<T>,signal?:AbortSignal):Promise<T>;
}
type Subscriber={resolve:(value:unknown)=>void;reject:(reason:unknown)=>void;signal?:AbortSignal;abort?:()=>void};
type Job={key:string;priority:HistoryReadPriority;load:()=>Promise<unknown>;active:boolean;subscribers:Set<Subscriber>};
const aborted=()=>new DOMException('History read cancelled','AbortError');
/** Shared display-history scheduling. Cancellation detaches a consumer, never aborts an active provider read. */
export function createHistoryReadQueue(maxConcurrent=2):HistoryReadQueue{
 if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1)throw Error('Invalid history concurrency');
 const jobs=new Map<string,Job>(),pending:Job[]=[];
 let active=0,background=0;
 const detach=(job:Job,s:Subscriber)=>{job.subscribers.delete(s);if(s.abort)s.signal?.removeEventListener('abort',s.abort);};
 function pump(){
  while(active<maxConcurrent){
   // Foreground can overtake waiting background, but cannot interrupt an active read.
   let index=pending.findIndex(j=>j.priority==='foreground');
   if(index<0&&background<1)index=pending.findIndex(j=>j.priority==='background');
   if(index<0)return;
   const job=pending.splice(index,1)[0];
   if(job.subscribers.size===0){jobs.delete(job.key);continue;}
   job.active=true;active++;if(job.priority==='background')background++;
   const activePriority=job.priority;
   const finish=(success:boolean,value:unknown)=>{
    active--;if(activePriority==='background')background--;if(jobs.get(job.key)===job)jobs.delete(job.key);
    for(const s of [...job.subscribers]){detach(job,s);if(success)s.resolve(value);else s.reject(value);}
    pump();
   };
   Promise.resolve().then(job.load).then(value=>finish(true,value),error=>finish(false,error));
  }
 }
 return {run<T>(key:string,priority:HistoryReadPriority,load:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  if(signal?.aborted)return Promise.reject(aborted());
  let job=jobs.get(key);
  if(!job){job={key,priority,load,active:false,subscribers:new Set()};jobs.set(key,job);pending.push(job);}
  else if(!job.active&&priority==='foreground')job.priority='foreground';
  const subscribed=job;
  return new Promise<T>((resolve,reject)=>{
   const s:Subscriber={resolve:value=>resolve(value as T),reject,signal};
   if(signal)s.abort=()=>{
    detach(subscribed,s);reject(aborted());
    if(!subscribed.active&&subscribed.subscribers.size===0){const i=pending.indexOf(subscribed);if(i>=0)pending.splice(i,1);if(jobs.get(key)===subscribed)jobs.delete(key);pump();}
   };
   subscribed.subscribers.add(s);if(s.abort)signal!.addEventListener('abort',s.abort,{once:true});
   pump();
  });
 }};
}
