def f(n,end):
    if n<end or n==8: return 0
    if n==end: return 1
    return f(n-1,end) + f(n-4,end) + f(n//3,end)
print(f(19,14)*f(14,2)) 