from functools import *
@cache
def F(n):
    return 2*(G(n-3)+8)
@cache
def G(n):
    if n<10:
        return 2*n
    return G(n-2)+1
for n in range(16000):
    G(n)
    F(n)
print(F(15548))