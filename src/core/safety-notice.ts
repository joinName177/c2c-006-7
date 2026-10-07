export function safetyNoticesFor(text: string): string[] {
  const notices: string[] = [];
  if (/医疗|诊断|治疗|medical/i.test(text)) notices.push('涉及医疗，请同时咨询合格医疗专业人士。');
  if (/法律|诉讼|合同|legal/i.test(text)) notices.push('涉及法律，请同时咨询合格法律专业人士。');
  if (/投资|股票|理财|investment/i.test(text)) notices.push('涉及投资，请评估承受能力并咨询持牌专业人士。');
  return notices;
}
