// 管理器固定使用中文；保留现有文案调用形式，避免改动各工作区的业务代码。
export function t(zh: string): string {
  return zh;
}

export function tf(key: string, args: Array<string | number>): string {
  return key.replace(/\{(\d+)\}/g, (match, index) => {
    const value = args[Number(index)];
    return value === undefined || value === null ? match : String(value);
  });
}
