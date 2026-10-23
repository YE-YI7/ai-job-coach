import {createHash} from 'node:crypto';

export function fingerprint(catalog) {
  return Object.fromEntries(Object.entries(catalog).map(([section,rows])=>[section,{
    count:rows.length,
    sha256:createHash('sha256').update(JSON.stringify(rows.map(row=>
      JSON.stringify(row,Object.keys(row).sort())).sort())).digest('hex'),
  }]));
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function compareCatalog(actual,expected) {
  const sections=fingerprint(actual);
  return Object.keys({...expected,...sections}).filter(key=>
    JSON.stringify(sections[key])!==JSON.stringify(expected[key]));
}
