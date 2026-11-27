#!/bin/sh
# One JSON line of machine facts for the CRT layout's SYS page (macOS).
ncpu=$(sysctl -n hw.ncpu 2>/dev/null || echo 1)
cpu=$(ps -A -o %cpu= | awk -v n="$ncpu" '{s+=$1} END{v=s/n; if(v>100)v=100; printf "%.0f", v}')
memsize=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
mem=$(vm_stat 2>/dev/null | awk -v total="$memsize" '
  /page size of/ {ps=$8}
  /Pages active/ {a=$3} /Pages wired down/ {w=$4} /Pages occupied by compressor/ {c=$5}
  END { if (total>0) printf "%.0f", (a+w+c)*ps*100/total; else printf "0" }')
disk=$(df -k /System/Volumes/Data 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}')
batt=$(pmset -g batt 2>/dev/null)
bat=$(printf '%s' "$batt" | grep -o '[0-9]*%' | head -1 | tr -d '%')
case "$batt" in *"AC Power"*) ac=true;; *) ac=false;; esac
load=$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | awk '{print $1" "$2" "$3}')
boot=$(sysctl -n kern.boottime 2>/dev/null | sed -E 's/^{ sec = ([0-9]+).*/\1/')
now=$(date +%s)
up=$(( (now - ${boot:-$now}) / 60 ))
# The busiest programs: name (no path, plain characters only) and share of one core.
top=$(ps -Aro %cpu=,comm= 2>/dev/null | head -4 | awk '{c=$1; $1=""; n=$0; sub(/^ +/,"",n); k=split(n,a,"/"); n=a[k]; gsub(/[^A-Za-z0-9._ -]/,"",n); printf "%s{\"n\":\"%s\",\"c\":%.0f}", (NR>1?",":""), n, c}')
# Bytes in and out on the default route's interface, since boot.
ifc=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
net=$(netstat -ib -I "${ifc:-en0}" 2>/dev/null | awk 'NR==2{printf "%s,%s", $7, $10}')
printf '{"cpu":%s,"mem":%s,"disk":%s,"bat":%s,"ac":%s,"load":"%s","up":%s,"now":%s,"top":[%s],"net":[%s]}\n' \
  "${cpu:-0}" "${mem:-0}" "${disk:-0}" "${bat:--1}" "$ac" "$load" "$up" "$now" "$top" "${net:-0,0}"
