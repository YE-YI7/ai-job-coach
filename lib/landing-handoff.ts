export const LANDING_HANDOFF_KEY='yizhi:landing-sentence:v1';
const lifetime=24*60*60*1000;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type LandingHandoff={id:string;text:string;createdAt:number;owner?:string};
export type LandingPreview={understanding:string;nextStep:string;source:'model'|'fallback'};
export type LandingHandoffWithPreview=LandingHandoff&{preview?:LandingPreview};

export function parseLandingHandoffId(value:unknown):string|null {
  return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)?value:null;
}
export function readLandingHandoff(store:Pick<Storage,'getItem'>,id:string|null,owner?:string,now=Date.now()):LandingHandoffWithPreview|null {
  try {
    const raw=JSON.parse(store.getItem(LANDING_HANDOFF_KEY)||'null') as LandingHandoff|null;
    if(!raw||!parseLandingHandoffId(raw.id)||(id&&raw.id!==id)||typeof raw.text!=='string'||
      raw.text.trim().length<2||raw.text.length>1000||!Number.isFinite(raw.createdAt)||
      now<raw.createdAt||now-raw.createdAt>lifetime||
      (raw.owner!==undefined&&(typeof raw.owner!=='string'||raw.owner!==owner)))return null;
    const preview=(raw as LandingHandoffWithPreview).preview;
    if(preview&&(!['model','fallback'].includes(preview.source)||typeof preview.understanding!=='string'||
      typeof preview.nextStep!=='string'||preview.understanding.length>1200||preview.nextStep.length>200))return null;
    return raw;
  } catch { return null; }
}
export function saveLandingHandoff(store:Store,text:string,id=crypto.randomUUID(),now=Date.now()):LandingHandoffWithPreview {
  const value=text.trim();
  if(value.length<2||value.length>1000||!parseLandingHandoffId(id))throw Error('请写下 2–1000 字的困惑。');
  const previous=readLandingHandoff(store,null,undefined,now);
  if(previous?.text===value)return previous;
  const handoff={id,text:value,createdAt:now};
  store.setItem(LANDING_HANDOFF_KEY,JSON.stringify(handoff));
  return handoff;
}
export function saveLandingPreview(store:Store,handoff:LandingHandoff,preview:LandingPreview) {
  const current=readLandingHandoff(store,handoff.id);
  if(current?.text===handoff.text)store.setItem(LANDING_HANDOFF_KEY,JSON.stringify({...current,preview}));
}
export function claimLandingHandoff(store:Store,id:string,owner:string):LandingHandoffWithPreview|null {
  const handoff=readLandingHandoff(store,id,owner);
  if(!handoff)return null;
  const claimed={...handoff,owner};
  store.setItem(LANDING_HANDOFF_KEY,JSON.stringify(claimed));
  return claimed;
}
export function completeLandingHandoff(store:Store,id:string,owner:string) {
  if(readLandingHandoff(store,id,owner))store.removeItem(LANDING_HANDOFF_KEY);
}
export function landingHandoffHref() {
  return '/cockpit?entry=one_sentence&handoff=1';
}
