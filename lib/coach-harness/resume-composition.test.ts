// Real composition guard: no mocked model or verification verdict.
import {citationGroundingDecision} from './guard-slots/verification.guards';
test('composed factual short bullets keep source-limited negative actions',()=>{
 const sources=[{id:'original',text:'参与校园工具项目,负责用户需求相关工作,具体个人交付还没梳理。'},{id:'a',text:'我先看了同学的使用反馈。'},{id:'b',text:'我按信息缺失、分类不清和状态更新慢三类整理成 Excel 需求清单，和负责页面的同学逐项核对；清单用于讨论调整。我没有负责开发或上线，也没有使用增长数据。'}];
 const candidateText='- 参与校园失物招领工具项目，先看了同学的使用反馈，按信息缺失、分类不清、状态更新慢三类整理成 Excel 需求清单\n- 和负责页面的同学逐项核对，清单用于讨论调整；没有负责开发或上线，也没有使用增长数据。';
 const verdict=citationGroundingDecision({citation:{candidateText,sources}});
 expect(verdict?.outcome).not.toBe('block');
});
test('reading feedback cannot become collecting it merely because another outcome verb exists in the source',()=>{
 const sources=[{id:'a',text:'我先看了同学的使用反馈。'},{id:'b',text:'我整理成 Excel 需求清单，没有使用增长数据。'}];
 expect(citationGroundingDecision({citation:{candidateText:'先收集同学的使用反馈',sources}})?.outcome).toBe('block');
 expect(citationGroundingDecision({citation:{candidateText:'先看了同学的使用反馈',sources}})?.outcome).not.toBe('block');
});
