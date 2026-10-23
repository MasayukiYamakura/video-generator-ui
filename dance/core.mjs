export const DEFAULT_REPO = "MasayukiYamakura/chibi-dance-generator";
export const WORKFLOW = "dance-ui.yml";
export const API = "https://api.github.com";
export function validRepo(repo) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
    throw Error("リポジトリ名を確認してください。");
  return repo;
}
export function parseDataset(value) {
  let ref = value.trim();
  if (ref.startsWith("https://www.kaggle.com/datasets/"))
    ref = new URL(ref).pathname.slice("/datasets/".length).replace(/\/$/, "");
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\/[1-9][0-9]*)?$/.test(ref))
    throw Error("KaggleのDataset URL、または所有者/名前を入力してください。");
  return ref;
}
export function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
}
export function submitRequest(values, catalog, id = newId()) {
  const mode = values.mode;
  if (!["smoke", "preview", "generate"].includes(mode))
    throw Error("生成方法を確認してください。");
  const seconds = Number(values.seconds),
    start = Number(values.start);
  if (![1, 2, 5].includes(seconds) || !Number.isFinite(start) || start < 0)
    throw Error("開始秒と長さを確認してください。");
  if (
    mode !== "smoke" &&
    !catalog.references.some((r) => r.id === values.reference_id)
  )
    throw Error("登録済みの参考動画を選んでください。");
  if (!["reference", "mute"].includes(values.audio))
    throw Error("音声設定を確認してください。");
  return {
    request_id: id,
    operation: "submit",
    mode,
    reference_id: values.reference_id || "",
    seconds: String(seconds),
    start: String(start),
    audio: values.audio,
    job_id: "",
  };
}
export function collectRequest(jobId, id = newId()) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(jobId))
    throw Error("回収対象の実行を選択してください。");
  return {
    request_id: id,
    operation: "collect",
    job_id: jobId,
    mode: "smoke",
    reference_id: "",
    seconds: "1",
    start: "0",
    audio: "reference",
  };
}
export function describe(entry, record, run, steps = []) {
  const runningStep = steps.find((s) => s.status === "in_progress");
  if (run && run.status !== "completed") {
    if (["queued", "pending", "waiting", "requested"].includes(run.status))
      return {
        title: "GitHub：実行待ち",
        detail: "前の処理が終わるまで待機しています。",
        busy: true,
      };
    if (runningStep && !runningStep.name.includes("依頼を受付"))
      return {
        title: "GitHub：" + runningStep.name,
        detail: "Kaggleの生成とは別の処理です。",
        busy: true,
      };
  }
  if (record?.collection === "complete")
    return {
      title: record.generation === "failed" ? "Kaggle：生成に失敗" : "完了",
      detail:
        record.generation === "failed"
          ? "詳細ログを確認してください。"
          : "結果の取得が完了しました。",
      busy: !!run && run.status !== "completed",
    };
  if (record?.collection === "failed")
    return {
      title: "GitHub：結果の回収・検査に失敗",
      detail:
        record.generation === "succeeded"
          ? "Kaggleでは生成済みです。「結果だけ再取得」を使えます。"
          : "生成結果を確認して、回収を再試行してください。",
      busy: !!run && run.status !== "completed",
    };
  if (record?.submission === "uncertain")
    return {
      title: "Kaggle：送信結果を確認できません",
      detail:
        "二重生成を防ぐため新しい生成を保留しています。実行ログを確認してください。",
      busy: true,
    };
  if (run?.status === "completed" && run.conclusion !== "success")
    return {
      title: "GitHub：処理が停止しました",
      detail:
        "Kaggleの稼働状況は別です。状態確認か、記録済み結果の再取得を行ってください。",
      busy: false,
    };
  if (record?.collection === "pending" || entry?.state === "waiting")
    return {
      title: "Kaggle：結果を待っています",
      detail:
        "待機時間を超えても生成失敗とは限りません。結果だけ再取得できます。",
      busy: !!run && run.status !== "completed",
    };
  if (entry?.state === "failed")
    return {
      title: "GitHub：処理に失敗",
      detail: "詳細ログを確認してください。",
      busy: false,
    };
  return {
    title: "GitHub：依頼を準備中",
    detail: "受付・配信状況を確認しています。",
    busy: !!run && run.status !== "completed",
  };
}
export function artifactLink(repo, run, artifact) {
  validRepo(repo);
  if (!/^\d+$/.test(String(run)) || !/^\d+$/.test(String(artifact)))
    throw Error("ダウンロード先が不正です。");
  return `https://github.com/${repo}/actions/runs/${run}/artifacts/${artifact}`;
}
export function isAvailable(artifact, now = Date.now()) {
  return (
    !!artifact && !artifact.expired && Date.parse(artifact.expires_at) > now
  );
}
export function contentJSON(item) {
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(item.content.replace(/\s/g, "")), (c) =>
        c.charCodeAt(0),
      ),
    ),
  );
}
export class GitHub {
  constructor(repo, token, fetcher = fetch) {
    this.repo = validRepo(repo);
    this.token = token;
    this.fetcher = fetcher;
  }
  async api(path, { method = "GET", body, missing = false } = {}) {
    if (path.startsWith("/") || path.includes("..") || path.includes("://"))
      throw Error("不正なAPIパスです。");
    const response = await this.fetcher(`${API}/repos/${this.repo}/${path}`, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404 && missing) return null;
    if (!response.ok)
      throw Error(
        `GitHub HTTP ${response.status}：接続先・トークンの権限・有効期限を確認してください。`,
      );
    return response.status === 204 ? null : response.json();
  }
  async json(path, ref = "main", missing = false) {
    const item = await this.api(
      `contents/${path}?ref=${encodeURIComponent(ref)}`,
      { missing },
    );
    return item ? contentJSON(item) : null;
  }
  async image(path) {
    let item = await this.api(`contents/${path}?ref=main`);
    if (item.size > 8 * 1024 * 1024) throw Error('キャラのプレビュー画像が大きすぎます。');
    // Contents returns metadata without base64 for files larger than 1 MiB.
    if (!item.content && /^[a-f0-9]{40}$/.test(item.sha))
      item = await this.api(`git/blobs/${item.sha}`);
    const value = (item.content || '').replace(/\s/g, '');
    if (!value || !/^[A-Za-z0-9+/=]+$/.test(value)) throw Error('キャラ画像を取得できませんでした。');
    return 'data:image/png;base64,' + value;
  }
  async dispatch(request) {
    return this.api(`actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      body: { ref: "main", inputs: request },
    });
  }
  async runs() {
    return (await this.api(`actions/workflows/${WORKFLOW}/runs?per_page=50`))
      .workflow_runs;
  }
}
