from math import *
for M in range(1,10000):
    N = 172
    i = ceil(log2(M))
    I = ceil(i*N/8)
    if 356_984*I >= 54*2**20:
        print(M)
        break