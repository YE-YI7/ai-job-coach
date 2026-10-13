import {noteRecoveryMessage} from './note-recovery';
test('断网保存不展示底层英文，明确原稿仍在与免费重试',()=>{
 expect(noteRecoveryMessage(new TypeError('Failed to fetch'),'save')).toBe('暂时没能保存，草稿仍在。恢复网络后点重试，不消耗 AI 额度。');
});
test('已有冲突提示保留，不误说保存成功',()=>{
 expect(noteRecoveryMessage(new Error('笔记已更新，请重新打开后修改'),'save')).toBe('笔记已更新，请重新打开后修改');
 expect(noteRecoveryMessage(new Error('NetworkError'),'read')).toContain('无法确认已保存');
});
