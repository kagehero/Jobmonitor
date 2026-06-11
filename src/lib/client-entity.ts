/**
 * クライアント（発注者）の事業主体（個人／法人）推定。
 *
 * クラウドソーシングの公開プロフィールには「法人/個人」の確定フィールドが無いため、
 *  1) 表示名のワード（株式会社・合同会社・Inc 等）による判定
 *  2) プロフィール由来の補助シグナル（is_official_account 等・CrowdWorks）
 * を組み合わせて推定する。最終確定はユーザーの手動上書き（ClientProfile.manualOverride）で行う。
 */

export type ClientEntityType = "UNKNOWN" | "INDIVIDUAL" | "CORPORATE";

/** プロフィール由来の補助シグナル（monitor が rawData に保存した値）。 */
export type ClientEntitySignals = {
  /** CrowdWorks: 公式アカウント（法人寄りの強いシグナル）。 */
  isOfficialAccount?: boolean | null;
  /** CrowdWorks: 認定クライアント。 */
  isCertifiedEmployer?: boolean | null;
  /** CrowdWorks: 本人確認済み（個人/法人の決め手にはならない補助）。 */
  identityVerified?: boolean | null;
};

export type EntityGuess = {
  type: ClientEntityType;
  /** 0–1。値が高いほど推定の確度が高い。 */
  confidence: number;
  /** 推定根拠（UI のツールチップ用）。 */
  reason: string;
};

/** 法人を強く示す表記（会社種別・接尾辞）。 */
const STRONG_CORP_PATTERNS: RegExp[] = [
  /株式会社/,
  /有限会社/,
  /合同会社/,
  /合資会社/,
  /合名会社/,
  /（株）|\(株\)|㈱|株）|株\)/,
  /（有）|\(有\)|㈲|有）|有\)/,
  /一般社団法人|一般財団法人|公益社団法人|公益財団法人|社会福祉法人|医療法人|学校法人|宗教法人|特定非営利活動法人|NPO法人/,
  /\b(?:Inc|Inc\.|LLC|L\.L\.C\.|Corp|Corp\.|Co\.,?\s*Ltd|Ltd|Ltd\.|K\.K\.|GmbH|PLC)\b/i,
];

/** 法人寄り（やや弱い）の業態語。単独では確度を中程度に。 */
const WEAK_CORP_PATTERNS: RegExp[] = [
  /カンパニー|ホールディングス|グループ|コーポレーション/,
  /\b(?:Company|Holdings|Group|Corporation|Agency|Studios?|Labs?|Partners|Solutions|Technologies|Systems|Works|Factory|Office)\b/i,
  /事務所|商店|工房|製作所|デザイン事務所|法律事務所|会計事務所|税理士法人|行政書士|司法書士/,
  /クリニック|歯科|医院|病院|薬局/,
  /店$|堂$|社$/,
];

/** 個人寄り（ハンドル名）。英数・記号のみのアカウント名は個人の可能性が高い。 */
const HANDLE_LIKE = /^[A-Za-z0-9_.\-]{2,}$/;

function testAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(name));
}

/**
 * 表示名 ＋ 任意のプロフィールシグナルから事業主体を推定する。
 * 不確実なものは UNKNOWN（confidence 低）として返し、UI で「推定」表示・手動補正を促す。
 */
export function guessClientEntity(
  displayNameRaw: string | null | undefined,
  signals?: ClientEntitySignals | null,
): EntityGuess {
  const name = (displayNameRaw ?? "").trim();

  // 1) プロフィールシグナル: 公式アカウントは法人の強いシグナル。
  if (signals?.isOfficialAccount === true) {
    return { type: "CORPORATE", confidence: 0.9, reason: "公式アカウント" };
  }

  if (!name) {
    return { type: "UNKNOWN", confidence: 0, reason: "名称未取得" };
  }

  // 2) 強い法人ワード。
  if (testAny(name, STRONG_CORP_PATTERNS)) {
    return { type: "CORPORATE", confidence: 0.97, reason: "会社種別の表記" };
  }

  // 3) 弱い法人ワード（業態語）。認定クライアントなら少し上振れ。
  if (testAny(name, WEAK_CORP_PATTERNS)) {
    const base = signals?.isCertifiedEmployer === true ? 0.7 : 0.6;
    return { type: "CORPORATE", confidence: base, reason: "業態を示す語" };
  }

  // 4) 英数ハンドル名は個人寄り（中程度）。
  if (HANDLE_LIKE.test(name)) {
    return { type: "INDIVIDUAL", confidence: 0.55, reason: "英数のハンドル名" };
  }

  // 5) 認定クライアントだが名前に手がかりなし → 弱く法人寄り。
  if (signals?.isCertifiedEmployer === true) {
    return { type: "CORPORATE", confidence: 0.45, reason: "認定クライアント" };
  }

  // 6) それ以外（日本語の人名・ニックネーム等）は決め手に欠ける。
  return { type: "UNKNOWN", confidence: 0.2, reason: "決め手なし（要確認）" };
}

const ENTITY_LABELS: Record<ClientEntityType, string> = {
  UNKNOWN: "不明",
  INDIVIDUAL: "個人",
  CORPORATE: "法人",
};

export function clientEntityLabel(type: ClientEntityType): string {
  return ENTITY_LABELS[type] ?? "不明";
}
