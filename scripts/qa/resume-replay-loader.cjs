module.exports=function(source){
 if(this.resourcePath.endsWith('.css')){
  const names=[...source.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(x=>x[1]);
  return `const style=document.createElement('style');style.textContent=${JSON.stringify(source)};document.head.append(style);export default ${JSON.stringify(Object.fromEntries(names.map(x=>[x,x])))};`;
 }
 return require('typescript').transpileModule(source,{compilerOptions:{jsx:require('typescript').JsxEmit.ReactJSX,target:require('typescript').ScriptTarget.ES2022,module:require('typescript').ModuleKind.ESNext}}).outputText;
};
