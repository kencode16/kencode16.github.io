# kencode16.github.io

個人作品集網站（中英雙語），展示資安稽核相關技能與學習筆記。
以 [Astro](https://astro.build) 建置，push 到 `main` 後由 GitHub Actions 自動部署到 GitHub Pages。

## 修改個人資料

名字、簡介、證照、技能、聯絡方式都在 [`src/data/profile.ts`](src/data/profile.ts)，中英文各一份。

## 新增筆記

在 `src/content/notes/zh/` 和 `src/content/notes/en/` 各新增一個**同檔名**的 `.md` 檔，中英文版就會互相連結。開頭格式：

```md
---
title: 筆記標題
description: 一兩句摘要，會顯示在列表與搜尋結果
date: 2026-10-21
updated: 2026-10-22   # 選填
tags: [標籤一, 標籤二]
controls: [A.8.13]    # 選填，相關的 ISO/IEC 27001:2022 控制措施
draft: true           # 選填，設為 true 時不會發布
---
```

可以直接在 GitHub 網頁上新增或編輯檔案，存檔（commit）後約 1 分鐘網站就會更新。

## 在自己電腦預覽

```sh
npm install
npm run dev
```
