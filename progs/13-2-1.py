from ipaddress import *
net = ip_network('105.224.200.224/255.255.255.224',0)
k = 0
for ip in net:
    s = f'{ip:b}'
    if s.count('1')%4==0:
        k += 1
print(k)