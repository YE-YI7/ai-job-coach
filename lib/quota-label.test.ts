import {quotaActionLabel} from './quota-label';
test('prices distinguish pools, shared free interview, points, and token usage',()=>{
 expect(quotaActionLabel('resume',{allowed:true,source:'free',remaining:3})).toBe('简历免费 1 次 · 余 3');
 expect(quotaActionLabel('interview',{allowed:true,source:'free',remaining:1})).toBe('聊天免费 1 次 · 余 1');
 expect(quotaActionLabel('chat',{allowed:true,source:'watcha',remaining:10})).toBe('1 积分 · 余 10');
 expect(quotaActionLabel('chat',{allowed:true,source:'tokenpay'})).toContain('按模型用量');
 expect(quotaActionLabel('chat',{allowed:false})).toBe('额度不足');
 expect(quotaActionLabel('chat')).toBe('费用待确认');
});
