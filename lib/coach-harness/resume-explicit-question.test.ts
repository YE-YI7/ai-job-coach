import {explicitMissingResumeQuestion,isVagueResumeResponsibility} from './resume-task-types';

test('missing-deliverable notes are not concrete actions and cannot hide vague responsibilities',()=>{
 expect(isVagueResumeResponsibility('- 参与校园二手平台项目，主要负责需求相关工作，具体个人交付还没梳理。')).toBe(true);
 expect(isVagueResumeResponsibility('负责运营相关工作，具体交付不清楚。')).toBe(true);
 expect(isVagueResumeResponsibility('整理商品表交给店长，协助运营相关工作，具体个人交付还没梳理。')).toBe(false);
 expect(isVagueResumeResponsibility('参与需求相关工作，梳理了十条反馈并交付清单。')).toBe(false);
});
test('explicit gaps can ask one fact, not contacts or ordinary duties',()=>{
 expect(explicitMissingResumeQuestion('参与校园项目，具体个人交付还没梳理。',[])?.field).toBe('deliverable');
 expect(explicitMissingResumeQuestion('负责店铺运营，整理商品资料和问题清单。',[])).toBeNull();
 expect(explicitMissingResumeQuestion('电话：13800000000，具体交付不清楚。',[])).toBeNull();
});
test('a saved answer is not silently sent back through the initial gap gate',()=>{
 const q=explicitMissingResumeQuestion('参与校园项目，具体个人交付还没梳理。',[])!;
 expect(explicitMissingResumeQuestion(q.sourceExcerpt,[{...q,answer:'我整理了需求清单',savedAt:'2026-10-15'}])).toBeNull();
});
test('vague experience asks an action without demanding numbers or an explicit gap label',()=>{
 expect(explicitMissingResumeQuestion('参加过校园二手平台项目，参与需求相关工作。',[])?.field).toBe('action');
 expect(explicitMissingResumeQuestion('协助社团活动，负责日常工作。',[])?.field).toBe('action');
 expect(explicitMissingResumeQuestion('核对商品价格并更新清单，协助运营相关工作。',[])).toBeNull();
 expect(explicitMissingResumeQuestion('负责模型评测和故障排查。',[])).toBeNull();
 expect(explicitMissingResumeQuestion('具备产品相关工作技能',[])).toBeNull();
});
