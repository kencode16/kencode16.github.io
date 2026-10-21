---
title: Cisco 交換器盤點常用指令
description: 接手網路設備時，用來盤點 Cisco 交換器、重建網路拓撲與設備清單的指令、步驟與注意事項。
date: 2026-10-07
updated: 2026-10-16
tags: [Cisco, 網路, 資產盤點]
controls: [A.5.9, A.8.9, A.8.20, A.8.22]
---

> 用途：接手網路設備時，用來盤點 Cisco 交換器、重建網路拓撲與設備清單。指令以 Cisco IOS / IOS-XE 為準，不同型號可能略有差異。

## 一、登入與基本操作

| 指令 | 用途 | 備註 |
| --- | --- | --- |
| `enable` | 進入特權模式（提示符號由 `>` 變成 `#`） | 需輸入 enable 密碼 |
| `configure terminal` | 進入設定模式 | 改設定才需要，盤點時不用 |
| `terminal length 0` | 讓輸出一次顯示完，不分頁 | 方便複製整段輸出存檔 |
| `exit` / `end` | 離開目前模式 / 直接回到特權模式 | |
| `copy running-config startup-config` | 把目前設定存到開機設定 | 也可用 `write memory`；有改設定才需要 |

## 二、找出相鄰設備（拓撲盤點最重要）

| 指令 | 用途 | 備註 |
| --- | --- | --- |
| `show cdp neighbors` | 簡要列出相鄰的 Cisco 設備與連接 port | Cisco 預設開啟 CDP |
| `show cdp neighbors detail` | 相鄰設備的名稱、型號、管理 IP、IOS 版本、雙方 port | 最重要，用來一台一台往下追 |
| `show lldp neighbors detail` | 用 LLDP 查相鄰設備 | 可看到非 Cisco 設備；需先開啟 LLDP |

## 三、設備基本資料

| 指令 | 用途 | 備註 |
| --- | --- | --- |
| `show version` | 型號、IOS 版本、開機時間、設備名稱 | |
| `show inventory` | 型號與序號（含模組、光纖模組） | 做財產清冊很好用 |
| `show running-config` | 目前生效的完整設定 | 建議每台都存檔備份 |
| `show startup-config` | 開機時載入的設定 | 與 running 不同，代表有改了沒存 |

## 四、介面與 VLAN

| 指令 | 用途 | 備註 |
| --- | --- | --- |
| `show ip interface brief` | 各介面 IP 與上下線狀態 | 查管理 IP、VLAN 介面 |
| `show interfaces status` | 每個 port 的狀態、VLAN、速度 | 快速看哪些 port 有在用 |
| `show interfaces trunk` | 哪些 port 是 trunk、帶哪些 VLAN | trunk 通常就是接其他交換器 |
| `show vlan brief` | VLAN 清單與所屬 port | |
| `show interfaces Gi1/0/1` | 單一 port 詳細狀態與錯誤計數 | 查線路品質問題 |

## 五、追查終端設備

| 指令 | 用途 | 備註 |
| --- | --- | --- |
| `show mac address-table` | MAC 位址與所在 port | 某 port MAC 很多但沒有 CDP 鄰居，可能接了小交換器 |
| `show mac address-table interface Gi1/0/1` | 查單一 port 學到的 MAC | |
| `show ip arp` | IP 與 MAC 對照表 | 在核心（三層）交換器上查才完整 |

## 六、狀態與除錯

| 指令 | 用途 | 備註 |
| --- | --- | --- |
| `show logging` | 系統日誌 | 查斷線、port 上下線紀錄 |
| `show spanning-tree` | 生成樹狀態、哪些 port 被擋 | 查迴圈問題 |
| `show environment all` | 電源、風扇、溫度 | 部分型號指令略有不同 |
| `ping <IP>` / `traceroute <IP>` | 測試連線與路徑 | |

## 七、重建拓撲的步驟

1. 在自己電腦執行 `ipconfig`，預設閘道通常就是核心交換器（或防火牆）的 IP。
2. 用 SSH（或 Telnet）登入核心交換器，執行 `terminal length 0`。
3. 執行 `show cdp neighbors detail`、`show version`、`show inventory`、`show ip interface brief`、`show interfaces status`、`show vlan brief`、`show running-config`，並存檔。
4. 從 CDP 結果取得下一台交換器的管理 IP，登入後重複步驟 3，直到沒有新設備。
5. 沒有 CDP 鄰居但 MAC 很多的 port，用 `show mac address-table interface` 追查，再到現場確認。

## 八、注意事項

- 沒有帳密時，需到現場用 console 線走 Cisco password recovery，過程要重開機，請排在非上班時間。
- 部分 port 若設定了 `no cdp enable`，就要靠 MAC 表或現場看線。
- 盤點時只用 `show` 指令，不會改變設定；進入 `configure terminal` 後的操作才會影響運作。
- 交換器數量多時，可用 Python（Netmiko）寫工具自動爬 CDP，產出設備清單與拓撲圖。

## 九、查交換器本身的 IP 與 MAC

| 指令 | 用途 | 備註 |
| --- | --- | --- |
| `show ip interface brief` | 查管理 IP | 看 Vlan 開頭那行（如 Vlan1、Vlan10） |
| `show version \| include MAC` | 查交換器本身 MAC | 顯示 Base ethernet MAC Address |
| `show interfaces vlan 1 \| include address` | 一次看 IP 與 MAC | Vlan1 換成實際管理 VLAN；`address is` 為 MAC，`Internet address is` 為 IP |

若要查的是接在交換器上的電腦：先用 `show mac address-table` 查 MAC，再到核心交換器用 `show ip arp` 對出 IP。

## 十、Python 自動盤點工具與防毒

**工具用途**：自動完成手動盤點，一台一台登入交換器下 `show` 指令並整理結果。程式只下 `show` 指令，不會改任何設定。

1. 輸入核心交換器 IP 與帳號，密碼執行時輸入，不寫在程式裡。
2. 用 SSH（Python 的 Netmiko 套件）登入，執行 `show cdp neighbors detail`、`show version`、`show inventory` 等指令。
3. 從 CDP 結果取得下一台的管理 IP，繼續登入，直到沒有新設備。
4. 產出設備清單 Excel、port 連線對照表、拓撲圖（瀏覽器開啟）及每台 running-config 備份。

**防毒誤判風險**（以 Symantec Endpoint Protection 為例）：

| 執行方式 | 被擋機率 | 原因 |
| --- | --- | --- |
| 直接執行 `.py` 原始碼 | 低 | 執行的是 Python 官方有簽章的 python.exe，腳本是純文字檔 |
| 打包成 `.exe`（PyInstaller） | 較高 | 無數位簽章、使用者少，信譽評等常判為 WS.Reputation.1，行為偵測（SONAR）也可能攔截 |

**網路行為**：工具只連 CDP 查到的設備，不會掃整個網段，較不會觸發 IPS 的掃描偵測。

**降低風險的做法**：

- 用 `.py` 執行，不要打包成 exe。
- 若有防毒管理主控台，在「例外」政策把工具資料夾或檔案雜湊值加入白名單。
- 先在自己電腦測試，確認沒被攔再正式使用。
- 電腦不能連外網時，`pip install netmiko` 會失敗，需先在可上網的電腦下載離線安裝檔。
- 安裝 Python 前確認組織的軟體安裝規範，必要時走申請流程，留下稽核紀錄。
- 不想安裝任何軟體：用 PuTTY 或 Tera Term 開啟記錄輸出，手動下指令後整理記錄檔。

## 十一、Cisco 2950 的 Console port 位置

**Q：Cisco 2950 的網路孔在前面，Console port 是不是在機器後面？**

A：是。Catalyst 2950 的網路孔在前面板，Console port 在後面板電源插座旁，是一個標示「CONSOLE」的 RJ-45 孔。

接 Console 注意事項：

- **線材**：要用 Cisco Console 線（淺藍色扁線，又稱 rollover 線），一般網路線不能用；另一端是 DB9 序列埠，電腦沒有序列埠時要再接 USB 轉 RS-232 轉接線。
- **連線軟體**：PuTTY 或 Tera Term，連線方式選 Serial，COM 號碼到裝置管理員查看。
- **連線參數**：9600、8 個資料位元、無同位元、1 個停止位元、不使用流量控制（9600 8N1）。
- **補充**：2950 為舊機型，Cisco 已停止支援與安全更新，盤點或稽核時可列為需汰換設備。

## 十二、Cisco 2950 背面像 VGA 的孔是 RPS 接頭

2950 背面有三個接頭：電源、RPS 接頭、RJ-45 Console port。像 VGA 的那個是 RPS（備援電源）接頭，用來接 Cisco 備援電源設備，與登入無關，請勿插任何 Console 線。

Console port 是旁邊標示「CONSOLE」的 RJ-45 孔。接法：電腦 USB → USB 轉 DB9 轉接線 → Cisco Console 線（DB9 端）→ RJ-45 端插 CONSOLE 孔。

- 裝置管理員 →「連接埠 (COM 和 LPT)」查 COM 號碼；若沒有或有驚嘆號，需安裝轉接線驅動（常見晶片 PL2303、FTDI）。
- PuTTY：Connection type 選 Serial、填 COM 號碼、Speed 9600；畫面全黑時按幾下 Enter。

## 十三、情境題：為什麼外部單位的交換器不直接接核心？

**情境**：外部單位管理的上游交換器（例：Catalyst 4500 系列），先接到我方機房的接入交換器（例：Catalyst 2960），再接到我方核心交換器（例：Catalyst 3750）。各網段以 VLAN 區分，一個 VLAN 對應一個網段。

**Q：為什麼不直接接核心？同事說是怕兩邊的路由亂掉，是這樣嗎？**

A：這種接法不奇怪。上游交換器屬於其他單位管理，中間放一台自己的交換器當「分界點」，目的是避免別人的設備直接影響我方核心。同事說的路由只是其中一項，實際上二層的風險更需要注意：

- **VTP（最危險）**：若 VTP 網域名稱相同、對方 revision 較大，對方的 VLAN 設定可能整個蓋掉我方核心的 VLAN，造成全面斷線。
- **STP**：對方優先權較高時可能搶走 Root Bridge，改變整個網路的轉送路徑。
- **路由**：兩邊都是三層設備且都開 OSPF／EIGRP 時，可能互相學到路由，對方的錯誤路由或預設路由會流進來。

**盲點**：2960 是二層設備，路由協定封包會直接穿過去。若上游與核心在同一個 VLAN 且都開動態路由，中間隔著 2960 仍會建立鄰居。分界交換器是否真的有保護作用，要看設定：

- 分界交換器接上游的 port 設 BPDU Filter 或 Root Guard，擋掉對方的 STP。
- 分界交換器的 VTP 設為 transparent，不跟著對方變動。
- 核心對該方向使用靜態路由，或將該介面設為 passive-interface，不交換動態路由。

若以上都沒設定，中間那台只是多一個單點故障，沒有實際保護效果。

因為各單位以 VLAN 區隔，上游到分界交換器很可能是 trunk，VTP 與 STP 風險比路由更值得注意。若我方網段的閘道在核心，且上游沒有我方網段的 SVI，上游只是搬運二層流量，路由問題不太會發生。

確認用指令：

| 指令 | 用途 | 在哪台執行 |
| --- | --- | --- |
| `show interfaces trunk` | 看接上游的 port 是否為 trunk、帶哪些 VLAN | 分界交換器 |
| `show vtp status` | 看 VTP 模式與網域名稱 | 分界、核心都執行 |
| `show spanning-tree` | 看 Root Bridge 是誰 | 分界交換器 |
| `show running-config interface Gi0/x` | 看該 port 有無 BPDU Filter／Root Guard | 分界交換器（Gi0/x 換成接上游的 port） |
| `show ip route` | 看有無來自上游的路由 | 核心 |
| `show ip ospf neighbor` | 看上游是否為路由鄰居 | 核心（EIGRP 用 `show ip eigrp neighbors`） |

## 稽核觀點：ISO/IEC 27001:2022 對應

| 筆記內容 | 對應控制措施 | 稽核時可以問、可以查 |
| --- | --- | --- |
| `show inventory` 取得型號與序號 | A.5.9 資訊及其他相關聯資產之清冊 | 資產清冊是否涵蓋所有網路設備？序號與實物是否一致？ |
| 每台備份 `running-config`；running 與 startup 不同代表改了沒存 | A.8.9 組態管理、A.8.13 資訊備份 | 是否有組態基準與定期備份？變更後是否存檔並留紀錄？ |
| 盤點只用 `show`；改設定排在非上班時間 | A.8.32 變更管理 | 設定變更是否經申請、核准、測試與紀錄？ |
| `show logging` 查斷線紀錄 | A.8.15 存錄 | 設備日誌是否集中保存？保存多久？ |
| 2950 已停止支援與安全更新 | A.8.8 技術脆弱性管理 | 是否有停止支援（EoL）設備清單，以及汰換計畫或風險接受紀錄？ |
| password recovery 只需要實體接觸 console | A.7.2 實體進入 | 機房與機櫃的進出是否受控並留紀錄？ |
| 與外部單位相接處的 VTP／STP／路由風險 | A.8.20 網路安全、A.8.22 網路區隔 | 網路架構文件是否標示與外部單位的分界點及防護設定？ |
| 密碼執行時才輸入，不寫進程式 | A.5.17 鑑別資訊 | 腳本或設定檔中是否有明文密碼？ |
| 安裝 Python 前確認軟體安裝規範 | A.8.19 運作中系統之軟體安裝 | 是否有軟體安裝申請與核准紀錄？ |
