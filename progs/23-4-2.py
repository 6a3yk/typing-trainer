from functools import *
@cache
def f(n,end):
    if n>end or n==35: return 0
    if n==end: return 1
    return f(n+1,end) + f(n+2,end) + f(n*2,end)
print(f(7,13)*f(13,15)*f(15,51)) 