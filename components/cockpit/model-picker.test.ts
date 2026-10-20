import {existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {MODEL_CATALOG} from "@/lib/coach-harness/model-catalog";
import {nextModelOption} from "./model-picker-navigation";

const source=readFileSync(join(process.cwd(),'components/cockpit/ModelPicker.tsx'),'utf8');
const css=readFileSync(join(process.cwd(),'components/cockpit/ModelPicker.module.css'),'utf8');

test('all vendor logos reuse existing local assets',()=>{
 for(const model of MODEL_CATALOG){expect(model.logo.startsWith('/models/')).toBe(true);expect(existsSync(join(process.cwd(),'public',model.logo))).toBe(true);}
 expect(source).toContain('src={option.logo}');
});
test('compact rows retain 44px targets and a real top-layer popup',()=>{
 expect(css).toContain('min-height:44px;padding:5px 8px');
 expect(css).toContain('.panel{position:fixed;inset:auto');
 expect(css).toContain('.panel:not(:popover-open){display:none}');
 expect(source).toContain('popover="auto"');
 expect(source).toContain('useId()');
 expect(source).toContain('window.innerWidth-width-12');
 expect(source).toContain('trigger.current?.focus({preventScroll:true})');
 expect(source).not.toContain('fetch(');
});
test('arrow navigation skips unavailable options and wraps',()=>{
 const available=[true,false,true,true];
 expect(nextModelOption(available,0,'ArrowDown')).toBe(2);
 expect(nextModelOption(available,2,'ArrowUp')).toBe(0);
 expect(nextModelOption(available,3,'ArrowDown')).toBe(0);
 expect(nextModelOption(available,0,'ArrowUp')).toBe(3);
});
test('home/end and disappearing selections only target enabled options',()=>{
 const available=[false,true,false,true,false];
 expect(nextModelOption(available,3,'Home')).toBe(1);
 expect(nextModelOption(available,1,'End')).toBe(3);
 expect(nextModelOption(available,2,'ArrowDown')).toBe(1);
 expect(nextModelOption(available,2,'ArrowUp')).toBe(3);
 expect(nextModelOption([false,false],0,'Home')).toBeNull();
});
