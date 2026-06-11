from itertools import *
k = 0
for s in product('0123456789ABCDE', repeat=5):
    s = ''.join(s)
    if s[0] != '0':
        if s.count('8')==1 and sum(b>='A' for b in s)>=2:
            k += 1
print(k)