def f(x):
    P = 15 <= x+0.5 <= 40
    Q = 21 <= x+0.5 <= 63
    A = A1 <= x+0.5 <= A2
    return P <= ( (Q and (not A)) <= (not P))
ans = []
for A1 in range(300):
    for A2 in range(A1+1,300):
        if all(f(x) for x in range(300)):
            ans.append(A2-A1)
print(min(ans))