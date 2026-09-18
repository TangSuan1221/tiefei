# 视频生成接口探测记录

> 2026-09-16 用 curl 实打 `https://llm-proxy.forgeax.com/v1/videos` 得到的结论。
> 写在这里是因为这个接口的形状决定了 `src/pod/net/video.ts` 的全部结构 ——
> 后来的人如果想改客户端，先读这一页，别再盲猜一遍。

## 结论速览

| 问题 | 答案 |
| --- | --- |
| 同步还是轮询 | **轮询**。POST 只给一个 job id，`status: "queued"` |
| 提交耗时 | ~1.8 s |
| 生成耗时 | **~9 s**（5 秒片长，`created_at` → `completed_at`） |
| 取片耗时 | ~8 s（2.0 MB mp4） |
| 端到端 | **约 20 秒** |
| CORS | **完全放开**，`access-control-allow-origin: *`，浏览器可直连 |
| 单价 | **$0.345 / 次**（响应头 `x-litellm-response-cost`） |
| 余额 | key 上限 $500，已花 $361.84 → 还剩约 400 次 |

上游是 LiteLLM 代理转 `https://api.minimaxi.com/v1`，接口形状抄的是 OpenAI Videos API。

## 1. 提交：`POST /v1/videos`

```
POST /v1/videos
Authorization: Bearer {KEY}
Content-Type: application/json

{"model":"minimax-h3-max","prompt":"...","duration":5,"size":"480p"}
```

HTTP 200，1.8 秒返回：

```json
{
  "id": "video_bGl0ZWxsbTpjdXN0b21fbGxtX3Byb3ZpZGVyOm1pbmltYXg7...",
  "object": "video",
  "status": "queued",
  "created_at": 1789548465,
  "completed_at": null,
  "expires_at": null,
  "error": null,
  "progress": null,
  "remixed_from_video_id": null,
  "seconds": "5",
  "size": "16:9",
  "model": "minimax-h3-max",
  "last_frame_url": null,
  "usage": { "duration_seconds": 5.0, "video_resolution": "768p" }
}
```

**注意两个坑：**

1. `status` 是 `queued`，**不是**成品。响应里没有任何视频 URL —— `last_frame_url` 是 null，
   而且它就算有值也只是最后一帧的图，不是片子。想拿片必须走第 3 步。
2. 请求里写 `"size":"480p"`，回来的是 `size: "16:9"` / `video_resolution: "768p"`。
   **这个参数不被尊重**，实际出片固定 768p 16:9。所以「省带宽」这条路走不通，
   降质只能在客户端做（见 `view/footage.ts`）。

## 2. 轮询：`GET /v1/videos/{id}`

同样的 JSON 形状，`status` 从 `queued` 变成 `completed`，`completed_at` 填上。
本次 `1789548465 → 1789548474`，**9 秒**。

这一步**不计费**：响应头 `x-litellm-response-cost-original: 0.0`。所以轮询可以放心打，
2.5 秒一次不心疼。

状态实测经过 `queued → in_progress → completed`。

### 内容审核会驳回怪物描述（重要）

第二段（倒扣的医务艇，威胁是「溺者合唱」）的提示词直接被驳回：

```
轮询 9.9s   status=in_progress
轮询 12.9s  status=failed   error.message = "output new_sensitive"
```

触发的那一句是造物的形态描述 ——「七个骨白色的人形立在水里，手挽着手，
头发向上散开，每一张嘴都开着对着镜头」。本作是恐怖游戏，**这类拒绝是常态
而不是异常**。

两个后果：

1. **失败照样计费。** 那一次的提交响应头一样写着
   `x-litellm-response-cost: 0.344827586`。
2. 客户端为此单开了一个失败分支（`net/video.ts` 的 `filtered`），
   被驳回时拿一份**不含怪物**的提示词重试一次 ——
   环境总比什么都没有好，而「那个东西刚好没拍进这一卷」在世界观里毫无破绽。

驳回的措辞不统一，只能按关键词认（`sensitive|moderation|violat|...`）。

## 3. 取片：`GET /v1/videos/{id}/content`

```
HTTP 200
Content-Type: video/mp4
Content-Length: 2075207
content-disposition: attachment; filename=video_....mp4
```

**直接吐 mp4 字节流**，没有中间 JSON，没有跳转。2.0～5.2 MB / 5 秒
（码率浮动很大，第二次实拍的一段是 5.2 MB）。
支持 `Range`（试过 `-r 0-1023`，正常返回）。同样不计费 ——
所以「生成一次，之后反复取」是免费的，这是 sessionStorage 只缓存 id 而不缓存
blob 的依据（见 `view/footage.ts` 的缓存注释）。

## 4. CORS

preflight：

```
OPTIONS /v1/videos            Origin: http://127.0.0.1:5180
→ access-control-allow-origin: *
  access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
  access-control-allow-headers: authorization,content-type
  access-control-max-age: 600
```

实请求（带 `Origin`）：

```
GET /v1/videos/{id}          → access-control-allow-origin: *
GET /viveos/{id}/content     → access-control-allow-origin: *
```

**所以浏览器可以直连，不需要为 CORS 加代理。**

但我们**默认仍然走 dev proxy**，理由和 CORS 无关：`import.meta.env.VITE_*` 会被
Vite 内联进产物，key 就跟着 js 一起发出去了。走 `/api/video` 让 key 只留在
node 进程里。生产环境必须自己部署同样的一层 —— 见 `vite.config.ts` 的注释。

## 5. 错误形状

无效 key，HTTP 401：

```json
{"error":{"message":"Authentication Error, Invalid proxy server token passed. Received API Key = sk-...alid, ...","type":"token_not_found_in_db","param":"key","code":"401"}}
```

JSON 体坏了，HTTP 400：

```json
{"error":{"message":"Invalid JSON payload: unexpected character: line 1 column 2 (char 1)","type":"invalid_request_error","param":"request_body","code":"400"}}
```

统一是 `{error:{message,type,param,code}}`，HTTP 状态码和 `code` 一致。
客户端只读 `error.message` 用于 console，游戏内一律换成世界观台词。

## 6. 出片的画面本身：必须降质，而且提示词管不住颜色

实拍的第一段（碎片场）画面质量是够用的 —— 一截炸开的舱段插在沉积物里，
一盏灯从左边打过来，悬浮物在光锥里飘。**但整片水是青绿色的**，
尽管提示词里写满了 `no green, no teal, no cyan, no emerald, no sea-green water`。

结论：**提示词是请求，不是约束。** 四色约束的执行点只能在客户端 ——
`src/pod/view/degrade.ts` 里那张亮度→四色查找表，把原图的色相整个丢掉。
离线验证：

```
npx tsx tools/footage-probe.ts --degrade 0

──── 恐怖游戏绿审计（GDD §8.1）────
  模型交回来的原片   2 / 146016 像素  0.00%
  过完四色约束之后   0 / 146016 像素  0.00%
  ✓ 一个绿像素都不剩
```

注意这两个数字都很小，而画面明显是青的 —— 因为 `isHorrorGreen` 只抓
饱和度 > 0.18 的绿，那层青绿水雾的饱和度在阈值以下，检查器抓不到它。
**所以真正靠得住的是查找表，不是检查器。** 对照图在
`tmp/footage/leg0-*-raw*.png`（原片）和 `-degraded*.png`（过完管线）。

## 7. PowerShell note

`curl` 在 PowerShell 里是 `Invoke-WebRequest` 的别名，会把 `-H` 当成
`-Headers` 并拒绝字符串。必须写 `curl.exe`，而且 `-d` 的 JSON 要放进文件用
`-d "@file.json"` —— 直接内联双引号会被 PowerShell 切碎，curl 会把
`A red balloon` 的每个词当成一个 URL 去解析。
