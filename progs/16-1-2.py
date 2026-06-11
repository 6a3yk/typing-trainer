from functools import *
@cache
def F(n):
    if n<31054: return F(n+4)+3020
    return 3*(G(n-2)-15) 
@cache
def G(n):
    if n>=28: return G(n-5)-15
    return 3*n-4
for n in range(32000):
    G(n)
for n in range(32000,0,-1):
    F(n)
print(F(15))