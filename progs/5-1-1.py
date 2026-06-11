def R(N):
    s = bin(N)[2:]
    if N%3==0:
        s += s[-3:]
    else:
        s += bin( (N%3)*3 )[2:]
    return int(s,2)
print(max(N for N in range(1,10000) if R(N)<130))