import {
  DEFAULT_REPO,
  WORKFLOW,
  GitHub,
  newId,
  submitRequest,
  collectRequest,
  describe,
  parseDataset,
  artifactLink,
  isAvailable,
} from "./core.mjs?v=20261023-connection-2";
const $ = (id) => document.getElementById(id),
  storageKey = "dance-studio-v1",
  pendingKey = (repo) => "dance-pending:" + repo;
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
let client = null,
  catalog = null,
  connected = false,
  busy = false,
  refreshing = false,
  pending = null,
  entries = [],
  runs = [],
  active = null,
  globalRuns = [],
  review = null;
const thumbCache = new Map();
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function remember() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      repo: $("repo").value.trim(),
      token: $("remember").checked ? $("token").value.trim() : "",
      remember: $("remember").checked,
    }),
  );
}
function savePending(value) {
  pending = value;
  if (value)
    localStorage.setItem(pendingKey(client.repo), JSON.stringify(value));
  else localStorage.removeItem(pendingKey(client.repo));
  renderPending();
  updateButtons();
}
function updateButtons() {
  for (const e of document.querySelectorAll(".connected"))
    e.disabled = !connected || busy;
  const locked =
    !!pending ||
    globalRuns.length > 0 ||
    (!!active && active.collection !== "complete");
  $("generate").disabled = $("preview").disabled =
    !connected || busy || locked || !catalog?.references.length;
  $("smoke").disabled = !connected || busy || locked;
  $("reference").disabled = !connected;
  $("retry-pending").disabled = !connected || busy;
  $("check-pending").disabled = !connected || busy;
  for (const e of document.querySelectorAll('.collect-action'))
    e.disabled = !connected || busy || !!pending || globalRuns.length > 0;
}
function renderPending() {
  $("pending-panel").hidden = !pending || !connected;
  $("pending-message").textContent = pending
    ? `受付ID：${pending.request.request_id}。画面を閉じても、この依頼の情報は保持します。`
    : "";
}
function refOptions() {
  const select = $("reference"),
    old = select.value;
  select.replaceChildren();
  if (!catalog.references.length)
    select.append(
      new Option("参考動画が未登録です。初回設定から登録してください。", ""),
    );
  else
    for (const r of catalog.references) select.append(new Option(r.name, r.id));
  if (catalog.references.some((r) => r.id === old)) select.value = old;
  $("character-name").textContent = catalog.character.name;
  updateButtons();
}
async function connect() {
  if (busy || refreshing) return;
  busy = true;
  updateButtons();
  try {
    client = new GitHub($("repo").value.trim(), $("token").value.trim());
    if (!client.token) throw Error("GitHubトークンを入力してください。");
    await client.api("");
    await client.api(`actions/workflows/${WORKFLOW}`);
    catalog = await client.json("config/dance-ui.json");
    if (catalog.version !== 1 || !Array.isArray(catalog.references))
      throw Error("画面設定の形式を確認してください。");
    connected = true;
    remember();
    pending = read(pendingKey(client.repo));
    refOptions();
    renderPending();
    $("badge").textContent = "接続済み";
    $("badge").classList.add("on");
    $("connection").open = !catalog.references.length;
    message("接続できました。参考動画を選び、まず短い区間で確認してください。");
    try {
      $("character").src = await client.image(catalog.character.path);
      $("character").hidden = false;
      $("character-placeholder").hidden = true;
    } catch {
      $("character").hidden = true;
      $("character-placeholder").hidden = false;
      $("character-placeholder").textContent = 'キャラ画像の取得は未完了です。生成・履歴は利用できます。';
    }
    await refresh();
  } catch (e) {
    connected = false;
    message(e.message, true);
    $("badge").textContent = "接続を確認";
    $("badge").classList.remove("on");
  } finally {
    busy = false;
    updateButtons();
  }
}
async function refresh() {
  if (!connected || refreshing) return;
  refreshing = true;
  try {
    const [index, current, uiRuns, allRuns] = await Promise.all([
      client.json("ui-index.json", "results", true),
      client.json("active.json", "results", true),
      client.runs(),
      client.api("actions/runs?per_page=100"),
    ]);
    entries = index?.requests || [];
    active = current;
    runs = uiRuns;
    globalRuns = allRuns.workflow_runs.filter(
      (r) =>
        [
          ".github/workflows/dance-ui.yml",
          ".github/workflows/kaggle-trial.yml",
        ].includes(r.path) && r.status !== "completed",
    );
    if (pending) {
      const id = pending.request.request_id;
      if (
        entries.some((e) => e.request_id === id) ||
        runs.some((r) => r.display_title === `Dance UI · ${id}`)
      ) {
        savePending(null);
        message("依頼を受け付けました。画面を閉じても処理は続きます。");
      }
    }
    await renderHistory();
    $("checked").textContent =
      "最終確認：" + new Date().toLocaleString("ja-JP");
    updateButtons();
  } catch (e) {
    message(
      "状態の取得に失敗しました。新しい生成は保留します。" + e.message,
      true,
    );
    globalRuns = [{ status: "unknown" }];
    updateButtons();
  } finally {
    refreshing = false;
  }
}
async function renderHistory() {
  const box = $("history");
  const list = entries.slice(0, 15).map((e) => ({ ...e }));
  const known = new Set(list.map((e) => e.workflow_run));
  for (const r of [...globalRuns, ...runs.slice(0, 10)]) {
    if (!known.has(String(r.id))) {
      known.add(String(r.id));
      list.push({
        request_id: r.display_title.replace("Dance UI · ", ""),
        workflow_run: String(r.id),
        created_at: r.created_at,
        reference_name: "受付・準備中",
      });
    }
  }
  if (active && !list.some((e) => e.job_id === active.job_id))
    list.push({
      request_id: "legacy-" + active.job_id,
      job_id: active.job_id,
      workflow_run: active.origin_workflow_run,
      created_at: "",
      reference_name: active.reference_name || "これまでの実行",
    });
  const cards = await Promise.all(
    list.map(async (entry) => {
      let record =
        entry.job_id === active?.job_id
          ? active
          : entry.job_id
            ? await client.json(`runs/${entry.job_id}.json`, "results", true)
            : null;
      const run =
        runs.find((r) => String(r.id) === entry.workflow_run) ||
        globalRuns.find((r) => String(r.id) === entry.workflow_run);
      let steps = [];
      if (run && run.status === "in_progress") {
        steps = (
          await client.api(`actions/runs/${run.id}/jobs?per_page=100`)
        ).jobs.flatMap((j) => j.steps || []);
      }
      const state = describe(entry, record, run, steps),
        card = node("article", undefined, "take");
      const heading = node("div", undefined, "take-head");
      const title = node("div");
      title.append(
        node(
          "h3",
          entry.reference_name ||
            record?.reference_name ||
            (entry.operation === "collect" ? "結果の再取得" : "ダンス制作"),
        ),
      );
      title.append(
        node(
          "p",
          entry.created_at
            ? new Date(entry.created_at).toLocaleString("ja-JP")
            : "以前の実行",
          "meta",
        ),
      );
      heading.append(title, node("span", state.title, "status"));
      card.append(heading, node("p", state.detail));
      const mode = entry.operation === 'collect' ? null : entry.mode || record?.mode;
      card.append(
        node(
          "p",
          `${mode === "generate" ? "GPU生成" : mode === "preview" ? "動きの確認（CPU）" : mode === "smoke" ? "接続テスト（CPU）" : "結果回収"}${record?.seconds ? " ／ " + record.seconds + "秒" : ""}${record?.start !== undefined ? " ／ 開始 " + record.start + "秒" : ""}`,
          "meta",
        ),
      );
      if (record?.job_id) {
        if (!thumbCache.has(record.job_id)) {
          const preview = await client.json(`previews/${record.job_id}.json`, "results", true);
          if (preview) thumbCache.set(record.job_id, preview);
        }
        const thumb = thumbCache.get(record.job_id);
        if (
          thumb?.mime === "image/jpeg" &&
          /^[A-Za-z0-9+/=]+$/.test(thumb.base64) &&
          thumb.base64.length < 70000
        ) {
          const image = node("img");
          image.alt = "生成結果の代表フレーム";
          image.src = "data:image/jpeg;base64," + thumb.base64;
          card.append(image);
        }
      }
      const actions = node("div", undefined, "actions");
      if (record?.version_ref && !state.busy) {
        const collect = node("button", "結果だけ再取得", "secondary collect-action");
        collect.onclick = () =>
          showReview(
            collectRequest(record.job_id),
            "生成済みの結果を再取得",
            "Kaggleで新しい動画は生成しません。",
          );
        collect.disabled = busy || !!pending || globalRuns.length > 0;
        actions.append(collect);
      }
      if (record) {
        const runId = record.artifact_workflow_run || entry.workflow_run;
        for (const [id, runFor, label] of [
          [
            record.media_artifact_id,
            record.media_workflow_run || runId,
            "動画をダウンロード（ZIP）",
          ],
          [record.diagnostic_artifact_id, runId, "詳細ログ（ZIP）"],
        ]) {
          if (!id) continue;
          const artifact = await client.api(`actions/artifacts/${id}`, {
            missing: true,
          });
          if (isAvailable(artifact)) {
            const a = node("a", label, "download");
            a.href = artifactLink(client.repo, runFor, id);
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            actions.append(a);
            card.append(
              node(
                "p",
                `${label}：${new Date(artifact.expires_at).toLocaleDateString("ja-JP")}まで`,
                "meta",
              ),
            );
          } else
            card.append(
              node("p", label + "：期限切れ、または削除済み", "meta"),
            );
        }
      }
      const workflow = entry.workflow_run || record?.origin_workflow_run;
      if (/^\d+$/.test(String(workflow))) {
        const a = node("a", "GitHubで詳しい状況を確認", "text-link");
        a.href = `https://github.com/${client.repo}/actions/runs/${workflow}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        card.append(a);
      }
      if (entry.job_id)
        card.append(node("p", "実行ID：" + entry.job_id, "meta"));
      card.append(actions);
      return card;
    }),
  );
  box.replaceChildren(...cards);
  if (!cards.length)
    box.append(
      node(
        "p",
        "まだ実行履歴はありません。最初は接続テストから確認できます。",
        "empty",
      ),
    );
}
function showReview(request, title, note) {
  if (busy || pending) return;
  review = request;
  $("review-title").textContent = title;
  const ref = catalog.references.find((r) => r.id === request.reference_id);
  $("review-content").textContent =
    request.operation === "collect"
      ? `対象実行：${request.job_id}`
      : `参考動画：${ref?.name || "接続テスト"}\n開始：${request.start}秒 ／ 長さ：${request.seconds}秒\n音声：${request.audio === "mute" ? "無音" : "参考動画の音声"}`;
  $("review-note").textContent = note;
  $("review").showModal();
}
async function dispatch(request, retry = false) {
  if (busy) return;
  busy = true;
  updateButtons();
  try {
    if (!retry) {
      savePending({ request, created_at: new Date().toISOString() });
    }
    await client.dispatch(request);
    message("実行を依頼しました。受付状況を確認しています。");
    await refresh();
  } catch (e) {
    message(
      "受付結果を確認できませんでした。同じ依頼のまま「受付状況を確認」してください。" +
        e.message,
      true,
    );
  } finally {
    busy = false;
    updateButtons();
  }
}
async function registerReference() {
  if (!connected || busy) return;
  busy = true;
  updateButtons();
  try {
    const name = $("reference-name").value.trim(),
      dataset = parseDataset($("dataset").value),
      video_path = $("video-path").value.trim();
    if (!name) throw Error("表示名を入力してください。");
    if (
      video_path &&
      (!video_path.startsWith("/kaggle/input/") || video_path.includes(".."))
    )
      throw Error("動画パスは/kaggle/input/から指定してください。");
    const file = await client.api("contents/config/dance-ui.json?ref=main");
    const latest = await client.json("config/dance-ui.json");
    if (
      latest.references.some(
        (r) => r.dataset === dataset && r.video_path === video_path,
      )
    )
      throw Error("この参考動画は登録済みです。");
    latest.references.push({ id: "ref-" + newId(), name, dataset, video_path });
    const content = btoa(
      String.fromCharCode(
        ...new TextEncoder().encode(JSON.stringify(latest, null, 2) + "\n"),
      ),
    );
    await client.api("contents/config/dance-ui.json", {
      method: "PUT",
      body: {
        message: "Register private dance reference",
        sha: file.sha,
        content,
        branch: "main",
      },
    });
    catalog = latest;
    refOptions();
    $("reference").value = latest.references.at(-1).id;
    message("参考動画を登録しました。動画生成はまだ起動していません。");
  } catch (e) {
    message(e.message, true);
  } finally {
    busy = false;
    updateButtons();
  }
}
$("connect").onclick = connect;
$("forget").onclick = () => {
  if (busy || refreshing) return;
  localStorage.removeItem(storageKey);
  client = null;
  connected = false;
  $("token").value = "";
  $("remember").checked = false;
  $("badge").textContent = "未接続";
  $("badge").classList.remove("on");
  $("character").hidden = true;
  $("character").removeAttribute("src");
  $("character-placeholder").hidden = false;
  $("history").replaceChildren(
    node("p", "接続情報を削除しました。実行履歴はGitHubに残ります。", "empty"),
  );
  message("接続情報を削除しました。");
  renderPending();
  updateButtons();
};
$("register").onclick = registerReference;
$("refresh").onclick = refresh;
$("check-pending").onclick = refresh;
$("retry-pending").onclick = () => pending && dispatch(pending.request, true);
$("cancel").onclick = () => {
  $("review").close();
  review = null;
};
$("confirm").onclick = () => {
  const request = review;
  review = null;
  $("review").close();
  if (request) dispatch(request);
};
for (const mode of ["preview", "generate", "smoke"])
  $(mode).onclick = () => {
    try {
      const request = submitRequest(
        {
          mode,
          reference_id: $("reference").value,
          seconds: mode === "smoke" ? "1" : $("seconds").value,
          start: mode === "smoke" ? "0" : $("start").value,
          audio: $("audio").value,
        },
        catalog,
      );
      showReview(
        request,
        mode === "generate"
          ? "GPUでダンスを生成します"
          : mode === "preview"
            ? "動きの確認を実行します"
            : "接続テストを実行します",
        mode === "generate"
          ? "KaggleのGPU枠を使います。生成品質は検証中です。"
          : "GPUは使用しません。",
      );
    } catch (e) {
      message(e.message, true);
    }
  };
const saved = read(storageKey);
if (saved) {
  $("repo").value = saved.repo || DEFAULT_REPO;
  $("remember").checked = !!saved.remember;
  $("token").value = saved.token || "";
}
if ($("token").value) connect();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
window.addEventListener("pageshow", () => refresh());
setInterval(() => {
  if (
    !document.hidden &&
    connected &&
    (pending || runs.some((r) => r.status !== "completed") || globalRuns.length)
  )
    refresh();
}, 30000);
