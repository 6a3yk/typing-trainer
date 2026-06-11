from itertools import *
k = 0
for s in product(sorted('ТЕОРИЯ'), repeat=6):
    k += 1
    s = ''.join(s)
    if k%2!=0 and s[0] not in 'РТЯ' and s.count('И')>=2:
        lastk = k
print(lastk)