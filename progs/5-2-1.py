def tr(x):
    s = ''
    while x > 0:
        s = str(x%3) + s
        x = x//3
    return s
print(int(tr(123456789),3))
def R(N):
    s = tr(N)
    if N%3==0: 
        s += s[-2:]
    else:
        s += tr((N%3)*5)
    return int(s,3)
print(R(11),R(12))
print(min(R(N) for N in range(1,10000) if R(N)>150))