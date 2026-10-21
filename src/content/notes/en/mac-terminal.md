---
title: macOS Terminal Basics
description: From cd, ls and /dev to file operations, network checks and connecting to network devices over a console cable, the macOS terminal commands I use most.
date: 2026-10-18
tags: [macOS, Terminal, Networking]
controls: [A.8.2, A.8.20]
---

## 1. Core ideas: cd, ls, /dev

- **`cd`** (change directory): move into a folder, like clicking into it in Finder.
- **`ls`** (list): list the files and folders in the current folder.
- **`/dev`** (devices): not a command but a folder. The system represents every hardware device as a "file" here, such as the disk `disk0`, Bluetooth devices, and a USB-to-console cable `cu.usbserial-XXXXXXXX`.

A path starting with `/` begins at the root folder, i.e. a "full path". When a command needs a device or file, a full path is the least error-prone.

**Example: connecting to a Juniper switch over a console cable**

1. `cd /dev`: go into the devices folder
2. `ls`: list all devices and find the console cable's name
3. `screen /dev/cu.usbserial-XXXXXXXX 9600`: connect to the switch through that cable

Steps 1 and 2 can be combined as `ls /dev/cu.*`, which needs no `cd` and only shows available serial ports.

## 2. Command reference

### 1. Moving around

| Command | Purpose | Example / notes |
| --- | --- | --- |
| `pwd` | Show the current folder | Type this first when lost |
| `cd folder` | Change to a folder | `cd /dev` |
| `cd ~` | Go to your home folder | i.e. `/Users/your-username` |
| `cd ..` | Go up one level | |
| `ls` | List the current folder | |
| `ls -la` | List everything, including hidden files, with details | Shows size, permissions, modification time |
| `ls /dev/cu.*` | List only matching names | `*` matches anything |

### 2. Files and folders

| Command | Purpose | Example / notes |
| --- | --- | --- |
| `mkdir name` | Create a folder | `mkdir backup` |
| `touch file` | Create an empty file | `touch notes.txt` |
| `cp source dest` | Copy a file | Add `-r` for folders |
| `mv source dest` | Move or rename | `mv a.txt b.txt` |
| `rm file` | Delete a file | ⚠ Skips the Trash; cannot be undone |
| `open file` or `open .` | Open with the default app | `open .` opens the current folder in Finder |

### 3. Reading and searching files

| Command | Purpose | Example / notes |
| --- | --- | --- |
| `cat file` | Print the whole file | Best for short files |
| `less file` | Page through a long file | Space for next page, `q` to quit |
| `head` / `tail file` | Show the first / last lines | `tail -f` follows a log live |
| `grep word file` | Search for text in a file | `grep -i` ignores case |
| `find path -name "name"` | Find files by name | `find ~ -name "*.docx"` |

### 4. Networking (everyday network admin)

| Command | Purpose | Example / notes |
| --- | --- | --- |
| `ping IP` | Test reachability | Ctrl+C to stop |
| `traceroute IP` | Show the hops along the path | |
| `ifconfig` | Show network interfaces and IPs | |
| `nslookup domain` | Query DNS | |
| `arp -a` | Show the IP-to-MAC table | Find devices on the same subnet |
| `netstat -rn` | Show the routing table | |
| `ssh user@IP` | Log in to a device remotely (encrypted) | `ssh admin@192.168.1.1` |
| `nc -zv IP port` | Test whether a port is open | `nc -zv 192.168.1.1 22` |

### 5. Serial console

| Command | Purpose | Example / notes |
| --- | --- | --- |
| `ls /dev/cu.*` | Find the USB-to-console cable's name | |
| `screen /dev/cu.xxx 9600` | Connect to a device over the console cable | Always use the full `/dev/` path |
| Ctrl+A → K → y | Quit screen | |
| `screen -ls` | List running screen sessions | Use when the port shows as busy |

### 6. System and processes

| Command | Purpose | Example / notes |
| --- | --- | --- |
| `whoami` | Show the current user | |
| `top` | Live view of processes and CPU usage | `q` to quit |
| `ps aux` | List all running processes | Often combined with `grep` |
| `kill PID` | Stop a process | Get the PID from `ps` or `top` |
| `df -h` | Show free disk space | |
| `sudo command` | Run with administrator rights | Asks for your Mac password; use with care |

### 7. Handy shortcuts

| Shortcut | Purpose | Example / notes |
| --- | --- | --- |
| Tab | Autocomplete file names and paths | Type the first few letters and press Tab |
| ↑ / ↓ | Recall previous commands | |
| Ctrl+C | Interrupt the running command | |
| `clear` (or Cmd+K) | Clear the screen | |
| `history` | List previous commands | |
| `man command` | Read the manual page | `man ls`, `q` to quit |

## 3. Caveats

- Files deleted with `rm` do not go to the Trash, and `-r` deletes whole folders. Double-check the path before running it.
- `sudo` runs with administrator rights. Do not add it to commands you do not fully understand.
- Commands and file names are case-sensitive, and spaces matter (they separate arguments).
- Wrap names or paths containing spaces in quotes, e.g. `cd "My Folder"`.

## Audit perspective: ISO/IEC 27001:2022 mapping

| From this note | Related control | What an auditor can ask or check |
| --- | --- | --- |
| `sudo` runs with administrator rights | A.8.2 Privileged access rights | Who holds admin rights? Are they approved and reviewed regularly? |
| Logging in to devices with encrypted `ssh` | A.8.20 Networks security | Has device management stopped using cleartext protocols such as Telnet? |
| `rm` cannot be undone | A.8.13 Information backup | Is important data backed up so accidental deletions can be restored? |
