# 第二关（-1 层生活区）招牌与海报字体

画布招牌、海报与店招逐字灯管只使用本目录内的字体，不再依赖 Windows 系统字体（微软雅黑、Bahnschrift、Impact、楷体）。

| 文件 | 来源字体 | 许可 | 用途（CSS family） |
|---|---|---|---|
| `NotoSansSC-Bold-living.woff2` | Noto Sans SC Bold（notofonts/noto-cjk，Sans2.004） | SIL OFL 1.1，见 `NotoSansCJK-LICENSE.txt` | `LivingSans` 中文招牌、海报 |
| `BarlowCondensed-SemiBold-living.woff2` | Barlow Condensed SemiBold（jpt/barlow） | SIL OFL 1.1，见 `Barlow-OFL.txt` | `LivingCond` 英文副标、编号 |
| `SairaStencilOne-living.woff2` | Saira Stencil One（Omnibus-Type/Saira） | SIL OFL 1.1，见 `Saira-OFL.txt` | `LivingStencil` 喷涂/警示 |
| `MaShanZheng-living.woff2` | Ma Shan Zheng（googlefonts/mashanzheng） | SIL OFL 1.1，见 `MaShanZheng-OFL.txt` | `LivingHand` 手写便条 |

- 四款字体的 OFL 文本均未声明保留字体名（Reserved Font Name）。子集文件名加 `-living` 后缀以示为修改版。
- 子集方式：fontTools `pyftsubset`，输出 woff2。中文两款只保留 `src/pod/view/deepsea/living-*.ts` 与 `src/pod/content/living-deck-layout.ts` 中出现的汉字和标点，加 ASCII。新增招牌文字若含新汉字，需重新子集，否则浏览器会回落到通用无衬线字体（`living-signage.ts` 的 `livingFontsReady` 只保证字体文件已加载）。
- 字体随游戏分发时必须附带对应许可文本；不得单独售卖字体文件。

# 舷窗磷光仪表字体（复古CRT）

| 文件 | 来源字体 | 许可 | 用途（CSS family） |
|---|---|---|---|
| `VT323-porthole.woff2` | VT323 Regular（google/fonts ofl/vt323） | SIL OFL 1.1，见 `VT323-OFL.txt` | `CrtMono` 舷窗数字、拉丁读数 |
| `FusionPixel12-porthole.woff2` | Fusion Pixel Font 12px monospaced zh_hans（TakWolf/fusion-pixel-font 2026.10.25） | SIL OFL 1.1，见 `FusionPixel-OFL.txt` 及其上游 `FusionPixel-ArkPixel-OFL.txt`、`FusionPixel-Cubic11-OFL.txt`、`FusionPixel-Galmuri-OFL.txt` | `CrtPixel` 舷窗中文像素字 |

- 两款 OFL 文本均未声明保留字体名。子集文件名加 `-porthole` 后缀以示为修改版。
- 子集方式：fontTools `pyftsubset`，输出 woff2。VT323 仅保留 ASCII 与 `°±·×—…←↑→↓`；Fusion Pixel 保留 GB2312 一级汉字（3755字）、ASCII、常用全角标点，以及子集时 `src/**/*.ts` 出现的全部汉字。
- 注册与字体栈在 `src/pod/view/crt-hud.ts`。像素字按 12px 整数倍（24/36px）使用最清晰。

## IPix — live porthole (2026-11-06)

IPix.ttf: IPix Regular, Copyright (c) 2019, zengsadi. Full font, 6864 mapped characters.
Author: https://purestudio.itch.io/ipix
Download mirror: https://www.zku.net/fonts-27700.html
File: https://www.zku.net/public/uploads/zitiFile/2020-03-12/5e69f74e98ae5.ttf
Author states HZK16 origins and uncertain public-domain status; this asset is not labelled SIL OFL here.
Used by porthole target labels, distance, heading, pitch and X/Y/DEPTH. Missing degree sign uses the existing fallback face.
