from functools import *

@cache
def f(s):
    s1,s2 = s
    moves = (s1+1,s2), (s1*3,s2), (s1,s2+1), (s1,s2*3)
    if s1+s2>=65: return 0
    if any(f(m)==0 for m in moves): return 1
    if all(f(m)==1 for m in moves): return 2
    if any(f(m)==2 for m in moves): return 3
    if all(f(m)==3 or f(m)==1 for m in moves): return 4
    
for s in range(1,100):
    if f((6,s)) in [2,3,4]:
        print(f((6,s))+17,s)