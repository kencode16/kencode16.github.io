---
title: 12 Common Server Roles and Where They Store Data
description: What 12 common server roles do, typical products, how they are deployed at different scales, and the four main ways servers store data.
date: 2026-10-13
tags: [Servers, Infrastructure, Backup]
controls: [A.8.13, A.8.14, A.8.17, A.8.22]
---

> "Server" usually means a software role, not a specific machine; one physical host can play several roles at once. Common hardware vendors: Dell, HPE, Lenovo, Supermicro.

## 1. 12 common server roles

### 01 Web server

- **What it does**: receives HTTP/HTTPS requests from browsers and returns web content (the "shop counter").
- **Used for**: public websites, intranet portals, web application front ends.
- **Common products**: Nginx, Apache, Microsoft IIS
- **In practice**: large organizations run several hosts behind a load balancer; small ones use a single host or cloud hosting; in the data center it sits in the DMZ.

### 02 Application server

- **What it does**: runs business logic such as calculations, workflows and permission checks (the "kitchen" that actually prepares what the web tier asks for).
- **Used for**: back ends of ERP, document management and attendance systems.
- **Common products**: Tomcat, JBoss/WildFly, Oracle WebLogic, IBM WebSphere, Node.js
- **In practice**: large organizations separate web, application and database tiers; small ones often put all three on one host; the application tier stays in the internal zone, never exposed directly.

### 03 Database server

- **What it does**: stores and queries structured data with SQL (the "warehouse and its keeper").
- **Used for**: HR, finance, document workflow and other system data.
- **Common products**: Oracle, Microsoft SQL Server, MySQL, PostgreSQL
- **In practice**: large organizations use replication or clustering for high availability; small ones run a single server with regular backups; it lives in the most protected zone.

### 04 File server

- **What it does**: central file storage and sharing (network drives like `\\server\share`).
- **Used for**: department shares and personal folders.
- **Common products**: Windows Server, Synology, QNAP (NAS), NetApp, Dell EMC
- **In practice**: large organizations use enterprise storage; small ones a single NAS; permissions are managed through AD.

### 05 DNS server

- **What it does**: translates names such as `www.example.com` into IP addresses (the "phone book").
- **Used for**: letting users reach hosts by name instead of memorizing IPs.
- **Common products**: Windows DNS, BIND, Infoblox; common public resolvers include HiNet `168.95.1.1` and Google `8.8.8.8`
- **In practice**: large organizations split internal and external DNS; small ones let the router or AD do it; run at least two for redundancy.

### 06 Mail server

- **What it does**: sends, receives and stores email (SMTP/IMAP/POP3) (the "post office").
- **Used for**: corporate or government email.
- **Common products**: Microsoft Exchange, Microsoft 365, Google Workspace, Openfind (common in Taiwanese government), Postfix
- **In practice**: large organizations self-host or run hybrid; small ones mostly use cloud mail; an anti-spam and antivirus gateway sits in front.

### 07 Proxy server

- **What it does**: browses on users' behalf and filters traffic (a "personal shopper who also does security checks").
- **Used for**: URL filtering, browsing logs and caching; a reverse proxy protects back-end web servers.
- **Common products**: Squid, Broadcom (Blue Coat), Zscaler, F5 (reverse proxy)
- **In practice**: large organizations force all web traffic through the proxy; small ones let the firewall do it; it sits at the internet edge.

### 08 Directory server

- **What it does**: central management of accounts, passwords, groups and permissions (the "HR and access control office").
- **Used for**: domain logon, single sign-on to other systems, Group Policy (GPO).
- **Common products**: Microsoft Active Directory (AD), Microsoft Entra ID, OpenLDAP
- **In practice**: large organizations run several domain controllers across sites; small ones a single AD server that also does DNS and DHCP; it is core infrastructure, and if it goes down nobody can log in.

### 09 DHCP server

- **What it does**: hands out IP address, gateway and DNS settings automatically ("automatic seat assignment").
- **Used for**: letting PCs get online at boot without manual IP configuration.
- **Common products**: Windows DHCP, Infoblox, ISC Kea; Cisco routers and switches can do it too
- **In practice**: large organizations centralize it with DHCP relay per VLAN; small ones let the router do it; servers always use static IPs, never DHCP.

### 10 Backup server

- **What it does**: schedules backups and restores data (the "safe").
- **Used for**: protection against ransomware, accidental deletion and hardware failure.
- **Common products**: Veeam, Veritas NetBackup, Commvault, Acronis, Synology Active Backup
- **In practice**: large organizations follow the 3-2-1 rule (3 copies, 2 media types, 1 off site) plus an off-site recovery location; small ones use a NAS plus external drives; data centers have tape libraries or a dedicated backup area.

### 11 Virtualization server

- **What it does**: runs many virtual machines on one physical host ("dividing a house into several apartments").
- **Used for**: saving hardware, fast deployment, snapshots and live migration.
- **Common products**: VMware vSphere/ESXi, Microsoft Hyper-V, Proxmox VE, Nutanix
- **In practice**: large organizations build clusters with shared storage; small ones run one or two Hyper-V or Proxmox hosts; most servers in a data center today are actually VMs.

### 12 NTP server

- **What it does**: keeps every device on the same time (the "master clock").
- **Used for**: making logs comparable across systems; AD logon (Kerberos) requires clocks within 5 minutes of each other.
- **Common products**: Windows w32time, chrony/ntpd, Meinberg, Microchip (GPS time servers)
- **In practice**: large organizations run internal NTP servers that sync to external sources; small ones sync directly to external NTP; closed networks without internet use a GPS time source, or designate AD or the core switch as the internal reference.

## 2. Where do servers keep their data?

**Q: Do servers usually store data on a disk array?**

A: Not necessarily. Disk arrays are used where data is important and must be highly available. There are four main options:

| Option | Description | Typical use / products |
| --- | --- | --- |
| Local disks + RAID (DAS) | Disks inside the server, combined by a RAID controller into RAID 1/5/6/10 | Most common for small sites or single servers, e.g. web, DNS, DHCP, NTP with little data |
| Disk array (SAN storage) | A separate storage system connected to many servers over Fibre Channel or iSCSI | Databases and virtualization clusters in large organizations; Dell EMC PowerStore, NetApp, HPE, IBM, Infortrend |
| NAS | Shares files over the network (SMB/NFS) | Mainly file servers and backup; Synology, QNAP |
| Hyperconverged (HCI) | No separate array; software pools each server's disks into shared storage | Nutanix, VMware vSAN |

**Matching server roles to storage**:

- Databases and virtualization hosts: SAN storage (VMs must be able to move between hosts).
- Files and backups: NAS or dedicated backup storage.
- Other lightweight services: local RAID is enough.

**Common confusions**:

- **RAID vs disk array**: RAID is a technique; a disk array is a device. Disk arrays use RAID internally to protect data.
- **RAID is not backup**: RAID only survives disk failure. It does not protect against accidental deletion or ransomware, so you still need backups.

## Audit perspective: ISO/IEC 27001:2022 mapping

| From this note | Related control | What an auditor can ask or check |
| --- | --- | --- |
| Web servers in the DMZ; application tier not exposed | A.8.22 Segregation of networks | Do network zones and firewall rules reflect the web / application / database tiers? |
| At least two DNS servers; database replication | A.8.14 Redundancy of information processing facilities | Do critical services have redundancy? Is failover tested regularly? |
| 3-2-1 backups; RAID is not backup | A.8.13 Information backup | Are there off-site or offline copies? Are restores tested and recorded? |
| NTP; Kerberos needs clocks within 5 minutes | A.8.17 Clock synchronization | Do all systems use the same time source? Can logs from different systems be correlated? |
| AD centralizes accounts, groups and permissions | A.5.15 Access control, A.5.18 Access rights | Are leavers' accounts disabled promptly? Are access rights reviewed regularly? |
| Proxy URL filtering and browsing logs | A.8.23 Web filtering | Are filtering rules and exceptions approved? How long are logs kept? |
| Antivirus gateway in front of mail | A.8.7 Protection against malware | Are the mail gateway and endpoint antivirus kept up to date? |
