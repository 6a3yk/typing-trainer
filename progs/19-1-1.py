from functools import *

@cache
def f(s):
    moves = s-3, s-8, s//3
    if s<=16: return 0
    if any(f(m)==0 for m in moves): return 1
    if all(f(m)==1 for m in moves): return 2
    if any(f(m)==2 for m in moves): return 3
    if all(f(m)==3 or f(m)==1 for m in moves): return 4
    
for s in range(1,100):
    if f(s) in [2,3,4]:
        print(f(s)+17,s)