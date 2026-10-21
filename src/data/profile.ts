// 網站上的個人資料都集中在這個檔案，中英文各一份。
// All personal details shown on the site live here, in both languages.

type Certification = {
  name: { zh: string; en: string };
  issuer: string;
  year: string;
  status: 'earned' | 'inProgress';
};

export const profile = {
  name: { zh: 'kencode16', en: 'kencode16' },
  title: {
    zh: '資訊安全稽核｜ISO/IEC 27001',
    en: 'Information Security Auditor | ISO/IEC 27001',
  },
  tagline: {
    zh: '從網路與基礎設施的實務出發，用看得懂現場的方式做 ISO/IEC 27001 稽核。',
    en: 'Hands-on network and infrastructure experience, applied to ISO/IEC 27001 auditing that understands what is actually running.',
  },
  about: {
    zh: [
      '我目前從事網路與資訊基礎設施的維運工作，日常包含網路設備盤點、拓撲重建、設定檢查與伺服器管理。',
      '在實務中我發現，許多資安風險藏在「沒有紀錄的設定」與「沒有盤點的設備」裡，因此開始有系統地學習 ISO/IEC 27001，希望把技術背景帶進資安稽核：不只看文件，也能看懂現場。',
    ],
    en: [
      'I work in network and IT infrastructure operations: inventorying network devices, rebuilding topology maps, reviewing configurations and looking after servers.',
      'Along the way I noticed that a lot of security risk hides in undocumented configurations and devices nobody has inventoried. That is why I am studying ISO/IEC 27001 systematically: to bring a technical background into security auditing, so the audit covers what is actually running, not only the paperwork.',
    ],
  },
  // 範例 / Example:
  // {
  //   name: { zh: 'ISO/IEC 27001:2022 主導稽核員', en: 'ISO/IEC 27001:2022 Lead Auditor' },
  //   issuer: '發證機構 / Issuer',
  //   year: '2026',
  //   status: 'earned', // 或 'inProgress'
  // },
  certifications: [] as Certification[],
  skills: [
    {
      group: { zh: '資安管理與稽核', en: 'ISMS & auditing' },
      items: {
        zh: [
          'ISO/IEC 27001:2022 條文與附錄 A 控制措施',
          '將現場技術狀況對應到控制措施',
          '蒐集稽核證據：設定檔、日誌、資產清冊',
        ],
        en: [
          'ISO/IEC 27001:2022 clauses and Annex A controls',
          'Mapping what is on the ground to specific controls',
          'Collecting audit evidence: configs, logs, asset inventories',
        ],
      },
      evidence: ['cisco-switch-inventory', 'server-roles'],
    },
    {
      group: { zh: '網路', en: 'Networking' },
      items: {
        zh: [
          'Cisco IOS / IOS-XE 交換器盤點與拓撲重建（CDP、LLDP）',
          'VLAN、Trunk、STP、VTP 風險判讀',
          'Juniper 交換器基本操作',
          'Console 連線（PuTTY、Tera Term、macOS screen）',
        ],
        en: [
          'Cisco IOS / IOS-XE switch inventory and topology discovery (CDP, LLDP)',
          'Assessing VLAN, trunk, STP and VTP risks',
          'Basic Juniper switch operation',
          'Console access (PuTTY, Tera Term, macOS screen)',
        ],
      },
      evidence: ['cisco-switch-inventory', 'mac-terminal'],
    },
    {
      group: { zh: '系統與基礎設施', en: 'Systems & infrastructure' },
      items: {
        zh: [
          '常見伺服器角色：AD、DNS、DHCP、NTP、Proxy 等',
          '備份策略（3-2-1）與 RAID、SAN、NAS',
          '虛擬化概念：VMware、Hyper-V、Proxmox',
        ],
        en: [
          'Common server roles: AD, DNS, DHCP, NTP, proxy and more',
          'Backup strategy (3-2-1), RAID, SAN and NAS',
          'Virtualization: VMware, Hyper-V, Proxmox',
        ],
      },
      evidence: ['server-roles'],
    },
    {
      group: { zh: '工具', en: 'Tools' },
      items: {
        zh: ['macOS／Linux 終端機', 'Python（Netmiko）網路自動盤點'],
        en: ['macOS / Linux command line', 'Python (Netmiko) for automated network inventory'],
      },
      evidence: ['mac-terminal', 'cisco-switch-inventory'],
    },
  ],
  contact: {
    email: '',
    github: 'https://github.com/kencode16',
    linkedin: '',
  },
  resumeUrl: '',
};
