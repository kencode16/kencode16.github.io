---
title: Cisco Switch Inventory Commands
description: Commands, steps and caveats for inventorying Cisco switches and rebuilding the network topology when taking over an existing network.
date: 2026-10-07
updated: 2026-10-16
tags: [Cisco, Networking, Asset inventory]
controls: [A.5.9, A.8.9, A.8.20, A.8.22]
---

> Purpose: inventory Cisco switches, rebuild the network topology and produce a device list when taking over an existing network. Commands are for Cisco IOS / IOS-XE; details vary slightly by model.

## 1. Logging in and basics

| Command | Purpose | Notes |
| --- | --- | --- |
| `enable` | Enter privileged EXEC mode (prompt changes from `>` to `#`) | Requires the enable password |
| `configure terminal` | Enter configuration mode | Only needed for changes, not for inventory |
| `terminal length 0` | Show all output at once, without paging | Makes it easy to copy and save the whole output |
| `exit` / `end` | Leave the current mode / jump back to privileged mode | |
| `copy running-config startup-config` | Save the running config to the startup config | Same as `write memory`; only needed after changes |

## 2. Finding neighbors (the key step for topology)

| Command | Purpose | Notes |
| --- | --- | --- |
| `show cdp neighbors` | Brief list of neighboring Cisco devices and the connecting ports | CDP is on by default on Cisco |
| `show cdp neighbors detail` | Neighbor name, model, management IP, IOS version and ports on both ends | The most important one: follow it device by device |
| `show lldp neighbors detail` | Neighbors discovered via LLDP | Shows non-Cisco devices too; LLDP must be enabled |

## 3. Device details

| Command | Purpose | Notes |
| --- | --- | --- |
| `show version` | Model, IOS version, uptime, hostname | |
| `show inventory` | Model and serial numbers (including modules and SFPs) | Great for the asset register |
| `show running-config` | Full configuration currently in effect | Save a copy for every device |
| `show startup-config` | Configuration loaded at boot | If it differs from running, changes were made but not saved |

## 4. Interfaces and VLANs

| Command | Purpose | Notes |
| --- | --- | --- |
| `show ip interface brief` | IP and up/down status per interface | Find the management IP and VLAN interfaces |
| `show interfaces status` | Status, VLAN and speed per port | Quick view of which ports are in use |
| `show interfaces trunk` | Which ports are trunks and which VLANs they carry | Trunks usually lead to other switches |
| `show vlan brief` | VLAN list and member ports | |
| `show interfaces Gi1/0/1` | Detailed status and error counters for one port | Diagnose cabling problems |

## 5. Tracing end devices

| Command | Purpose | Notes |
| --- | --- | --- |
| `show mac address-table` | MAC addresses and the ports they were learned on | Many MACs on a port with no CDP neighbor usually means an unmanaged switch |
| `show mac address-table interface Gi1/0/1` | MACs learned on a single port | |
| `show ip arp` | IP-to-MAC mapping | Only complete on the core (layer 3) switch |

## 6. Health and troubleshooting

| Command | Purpose | Notes |
| --- | --- | --- |
| `show logging` | System log | Link drops, ports going up and down |
| `show spanning-tree` | Spanning tree state, blocked ports | Diagnose loops |
| `show environment all` | Power, fans, temperature | Syntax differs on some models |
| `ping <IP>` / `traceroute <IP>` | Test reachability and path | |

## 7. Steps to rebuild the topology

1. Run `ipconfig` on your own PC. The default gateway is usually the core switch (or the firewall).
2. SSH (or Telnet) into the core switch and run `terminal length 0`.
3. Run `show cdp neighbors detail`, `show version`, `show inventory`, `show ip interface brief`, `show interfaces status`, `show vlan brief` and `show running-config`, and save the output.
4. Take the next switch's management IP from the CDP output, log in and repeat step 3 until no new devices appear.
5. For ports with many MACs but no CDP neighbor, trace them with `show mac address-table interface` and confirm on site.

## 8. Caveats

- Without credentials, you need to go on site and run Cisco password recovery over the console. It requires a reboot, so schedule it outside business hours.
- Ports with `no cdp enable` must be traced through the MAC table or by following the cable.
- Inventory only uses `show` commands, which change nothing. Only commands entered after `configure terminal` affect operation.
- With many switches, a Python (Netmiko) tool can crawl CDP automatically and produce the device list and topology diagram.

## 9. Finding the switch's own IP and MAC

| Command | Purpose | Notes |
| --- | --- | --- |
| `show ip interface brief` | Management IP | Look at the lines starting with Vlan (e.g. Vlan1, Vlan10) |
| `show version \| include MAC` | The switch's own MAC | Shows the Base ethernet MAC Address |
| `show interfaces vlan 1 \| include address` | IP and MAC in one go | Replace Vlan1 with the real management VLAN; `address is` is the MAC, `Internet address is` the IP |

To find a PC connected to the switch: look up its MAC with `show mac address-table`, then match it to an IP with `show ip arp` on the core switch.

## 10. A Python inventory tool and antivirus

**What it does**: automates the manual inventory by logging in to each switch, running `show` commands and organizing the results. It only runs `show` commands and never changes configuration.

1. Enter the core switch IP and username. The password is typed at run time, never stored in the code.
2. Log in over SSH (Python's Netmiko library) and run `show cdp neighbors detail`, `show version`, `show inventory` and so on.
3. Take the next device's management IP from the CDP output and continue until no new devices appear.
4. Produce an Excel device list, a port connection map, a topology diagram (opens in a browser) and a running-config backup for every device.

**False-positive risk with antivirus** (Symantec Endpoint Protection as an example):

| How it runs | Chance of being blocked | Why |
| --- | --- | --- |
| Running the `.py` source directly | Low | The process is the officially signed python.exe; the script is plain text |
| Packaged as an `.exe` (PyInstaller) | Higher | No code signature and few users, so reputation scoring often flags it as WS.Reputation.1, and behavioral detection (SONAR) may also block it |

**Network behavior**: the tool only connects to devices found through CDP and never sweeps whole subnets, so it is unlikely to trigger IPS scan detection.

**Reducing the risk**:

- Run the `.py` file; do not package it as an exe.
- If you have an antivirus management console, add the tool's folder or file hash to an exception policy.
- Test on your own PC first and confirm it is not blocked before using it for real.
- On a PC without internet access, `pip install netmiko` fails; download offline installers on a connected machine first.
- Check the organization's software installation policy before installing Python, and go through the request process if needed so there is an audit trail.
- To avoid installing anything: enable session logging in PuTTY or Tera Term, run the commands by hand and tidy up the log afterwards.

## 11. Where is the console port on a Cisco 2950?

**Q: The network ports on a Cisco 2950 are on the front. Is the console port on the back?**

A: Yes. The Catalyst 2950 has its network ports on the front panel and the console port on the back, next to the power socket: an RJ-45 port labeled "CONSOLE".

Things to know when connecting to the console:

- **Cable**: you need a Cisco console cable (the flat light-blue "rollover" cable); a normal network cable will not work. The other end is a DB9 serial connector, so a PC without a serial port also needs a USB-to-RS-232 adapter.
- **Software**: PuTTY or Tera Term with connection type Serial. Find the COM port number in Device Manager.
- **Settings**: 9600 baud, 8 data bits, no parity, 1 stop bit, no flow control (9600 8N1).
- **Note**: the 2950 is end-of-life. Cisco no longer provides support or security updates, so flag it for replacement during inventory or audit.

## 12. The VGA-like port on the back of a 2950 is the RPS connector

The back of a 2950 has three connectors: power, the RPS connector and the RJ-45 console port. The one that looks like VGA is the RPS (redundant power supply) connector for Cisco's backup power units. It has nothing to do with logging in, so do not plug a console cable into it.

The console port is the RJ-45 port next to it labeled "CONSOLE". The chain is: PC USB → USB-to-DB9 adapter → Cisco console cable (DB9 end) → RJ-45 end into the CONSOLE port.

- In Device Manager → "Ports (COM & LPT)", find the COM number. If it is missing or shows a warning icon, install the adapter driver (common chips: PL2303, FTDI).
- PuTTY: set Connection type to Serial, enter the COM port and Speed 9600. If the screen stays black, press Enter a few times.

## 13. Scenario: why not connect another unit's switch straight to the core?

**Scenario**: an upstream switch managed by another unit (e.g. a Catalyst 4500) connects first to our own access switch (e.g. a Catalyst 2960), which then connects to our core switch (e.g. a Catalyst 3750). Segments are separated by VLAN, one VLAN per subnet.

**Q: Why not connect it directly to the core? A colleague says it is to keep the two sides' routing from getting mixed up. Is that right?**

A: This design is reasonable. The upstream switch belongs to someone else, so putting our own switch in between creates a demarcation point that keeps their equipment from directly affecting our core. Routing is only part of the story; the layer 2 risks deserve more attention:

- **VTP (the most dangerous)**: if the VTP domain names match and their revision number is higher, their VLAN database can overwrite ours on the core and take the whole site down.
- **STP**: if their bridge priority is better, they can become Root Bridge and change forwarding paths across our network.
- **Routing**: if both sides are layer 3 and run OSPF/EIGRP, they may learn each other's routes, letting wrong routes or default routes leak in.

**Blind spot**: the 2960 is a layer 2 device, so routing protocol packets pass straight through it. If the upstream switch and our core sit in the same VLAN and both run dynamic routing, they will still form an adjacency through the 2960. Whether the demarcation switch actually protects anything depends on its configuration:

- Set BPDU Filter or Root Guard on the demarcation switch's upstream-facing port to block their STP.
- Set VTP on the demarcation switch to transparent so it does not follow their changes.
- On the core, use static routes towards that side, or make the interface a passive-interface so no dynamic routes are exchanged.

If none of this is configured, the switch in the middle only adds a single point of failure without real protection.

Because units are separated by VLAN, the upstream link is most likely a trunk, which makes VTP and STP more of a concern than routing. If our gateways live on our core and the upstream switch has no SVI in our subnets, it is only carrying layer 2 traffic and routing problems are unlikely.

Commands to verify:

| Command | Purpose | Run on |
| --- | --- | --- |
| `show interfaces trunk` | Is the upstream-facing port a trunk, and which VLANs does it carry? | Demarcation switch |
| `show vtp status` | VTP mode and domain name | Both demarcation and core |
| `show spanning-tree` | Who is Root Bridge? | Demarcation switch |
| `show running-config interface Gi0/x` | Does the port have BPDU Filter / Root Guard? | Demarcation switch (replace Gi0/x with the upstream port) |
| `show ip route` | Any routes learned from upstream? | Core |
| `show ip ospf neighbor` | Is the upstream switch a routing neighbor? | Core (`show ip eigrp neighbors` for EIGRP) |

## Audit perspective: ISO/IEC 27001:2022 mapping

| From this note | Related control | What an auditor can ask or check |
| --- | --- | --- |
| `show inventory` gives models and serial numbers | A.5.9 Inventory of information and other associated assets | Does the asset inventory cover every network device? Do serial numbers match the hardware? |
| Back up every `running-config`; running differing from startup means unsaved changes | A.8.9 Configuration management, A.8.13 Information backup | Is there a configuration baseline with regular backups? Are changes saved and recorded? |
| Inventory uses only `show`; changes are scheduled out of hours | A.8.32 Change management | Are configuration changes requested, approved, tested and recorded? |
| `show logging` for link drops | A.8.15 Logging | Are device logs collected centrally? How long are they kept? |
| The 2950 is end-of-life with no security updates | A.8.8 Management of technical vulnerabilities | Is there a list of EoL devices with a replacement plan or a risk acceptance record? |
| Password recovery only needs physical console access | A.7.2 Physical entry | Is access to the server room and racks controlled and logged? |
| VTP / STP / routing risks at the boundary with another unit | A.8.20 Networks security, A.8.22 Segregation of networks | Does the network architecture document show demarcation points and their protective settings? |
| Passwords are typed at run time, not stored in code | A.5.17 Authentication information | Are there plaintext passwords in scripts or config files? |
| Check the software installation policy before installing Python | A.8.19 Installation of software on operational systems | Are there records of software installation requests and approvals? |
