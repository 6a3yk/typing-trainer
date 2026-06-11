t = open('24.txt').read()
l = t.split('Y')
ans = []
for i in range(len(l)-80):
    s = 'Y'.join(l[i:i+81])
    if s.count('2025')>=90:
        ans.append(len(s))
print(max(ans))