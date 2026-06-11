def dels(n):
    deli = set()
    for d in range(2,int(n**0.5)+1):
        if n%d==0:
            deli.add(d)
            deli.add(n//d)
    return sorted(deli)
for N in range(5_400_001, 5_410_001):
    deli = dels(N)
    prost = [d for d in deli if not(dels(d))]
    if prost:
        M = min(prost) + max(prost)
        if M>60000 and str(M)==str(M)[::-1]:
            print(N,M)