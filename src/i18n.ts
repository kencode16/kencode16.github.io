export type Lang = 'zh' | 'en';

export const otherLang = (lang: Lang): Lang => (lang === 'zh' ? 'en' : 'zh');

export const htmlLang: Record<Lang, string> = { zh: 'zh-Hant-TW', en: 'en' };

export const ui = {
  zh: {
    nav: { about: '關於', skills: '技能', notes: '筆記', contact: '聯絡' },
    colon: '：',
    listSep: '、',
    switchLabel: 'EN',
    switchTitle: 'English version',
    readNotes: '閱讀學習筆記',
    contactMe: '聯絡我',
    resume: '下載履歷',
    about: '關於我',
    certifications: '證照',
    certStatus: { earned: '已取得', inProgress: '準備中' },
    skills: '技能',
    skillsIntro: '稽核講求證據，所以每項技能都附上對應的學習筆記作為佐證。',
    evidence: '佐證筆記',
    latestNotes: '最新筆記',
    allNotes: '所有筆記',
    notesIntro: '工作與自學過程中整理的筆記，每篇最後附上 ISO/IEC 27001:2022 的稽核觀點。',
    contact: '聯絡方式',
    contactIntro: '歡迎來信討論資安稽核相關職缺與合作機會。',
    backToNotes: '返回筆記列表',
    created: '建立',
    updated: '更新',
    relatedControls: '相關控制措施',
    footer: '以 Astro 建置，部署於 GitHub Pages。',
  },
  en: {
    nav: { about: 'About', skills: 'Skills', notes: 'Notes', contact: 'Contact' },
    colon: ': ',
    listSep: ', ',
    switchLabel: '中文',
    switchTitle: '中文版',
    readNotes: 'Read my notes',
    contactMe: 'Get in touch',
    resume: 'Download résumé',
    about: 'About me',
    certifications: 'Certifications',
    certStatus: { earned: 'Earned', inProgress: 'In progress' },
    skills: 'Skills',
    skillsIntro: 'Audits run on evidence, so every skill below links to the notes that back it up.',
    evidence: 'Evidence',
    latestNotes: 'Latest notes',
    allNotes: 'All notes',
    notesIntro:
      'Notes from my day-to-day work and self-study. Each one ends with an ISO/IEC 27001:2022 audit perspective.',
    contact: 'Contact',
    contactIntro: 'Happy to talk about information security audit roles and collaboration.',
    backToNotes: 'Back to notes',
    created: 'Created',
    updated: 'Updated',
    relatedControls: 'Related controls',
    footer: 'Built with Astro, hosted on GitHub Pages.',
  },
} as const;

export const localize = (lang: Lang, path: string) => (lang === 'en' ? `/en${path}` : path);

export const formatDate = (date: Date) => date.toISOString().slice(0, 10);
