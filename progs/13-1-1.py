from ipaddress import *
net = ip_network('205.99.68.249/255.255.248.0',0)
print(net[-2])