from math import *
for N in range(1,10000):
    M = 27
    i = ceil(log2(M))
    I = ceil(i*N/8)
    if 3548*I > 12*1024:
        print(N)
        break