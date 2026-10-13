/** Browser transport errors are not useful recovery instructions for a job seeker. */
export function noteRecoveryMessage(error:unknown,action:'read'|'save'){
 const message=error instanceof Error?error.message:'';
 // Only our short human-readable server messages may pass through.
 if(message.length<=160&&/[\u4e00-\u9fff]/.test(message))return message;
 return action==='save'
  ?'暂时没能保存，草稿仍在。恢复网络后点重试，不消耗 AI 额度。'
  :'暂时无法确认已保存成果，请恢复网络后重新打开。';
}
