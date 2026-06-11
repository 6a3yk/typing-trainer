t = open('24.txt').read()
n = len(t)
ans = []
l=r=0
while l < n:
    s = t[l:r]
    if s.count('S')>35 or s and s[0] not in '02468' or sum(s.count(b) for b in '02468')>1 or r == n:
        l += 1
    elif s.count('S')==35:
        ans.append(len(s))
        r += 1
    else: 
        r += 1
print(max(ans))