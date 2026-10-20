export type ModelNavigationKey="ArrowDown"|"ArrowUp"|"Home"|"End";
export function nextModelOption(available:boolean[],active:number,key:ModelNavigationKey):number|null{
 const enabled=available.flatMap((yes,index)=>yes?[index]:[]);
 if(!enabled.length)return null;
 if(key==="Home")return enabled[0];
 if(key==="End")return enabled.at(-1)!;
 const position=enabled.indexOf(active);
 if(position<0)return key==="ArrowUp"?enabled.at(-1)!:enabled[0];
 return enabled[(position+(key==="ArrowUp"?-1:1)+enabled.length)%enabled.length];
}
