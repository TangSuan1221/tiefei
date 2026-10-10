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
